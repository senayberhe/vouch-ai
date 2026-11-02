"""Optional web search (Brave), local Ollama writer, writer pool routing and the `auto` embedder."""
import io
import json
from types import SimpleNamespace
import pytest
from capstone import embeddings, llm, web_search
from capstone.config import Settings, valid_base_url
from capstone.db import ModelVersion
from capstone.llm import ABSTAIN, ABSTAIN_MESSAGE, OllamaWriter, WriterPool
from capstone.web_search import BraveSearch, web_result, with_web

EVIDENCE = [{"citation_id": "d1:c0", "text": "Receipts are due within thirty days."},
            {"citation_id": "d2:c0", "text": "Severity 1 incidents are acknowledged within 15 minutes."}]
ENV = {"CAPSTONE_TOKENS_JSON": json.dumps({"a" * 24: {"tenant": "acme", "user": "alice", "groups": [], "role": "editor"}}),
       "CAPSTONE_ROUTING_SECRET": "r" * 40}


def fake_urlopen(monkeypatch, module, body: bytes | Exception, seen=None):
    def urlopen(request, timeout):
        if seen is not None:
            seen.append(request)
        if isinstance(body, Exception):
            raise body
        return io.BytesIO(body)
    monkeypatch.setattr(module.urllib.request, "urlopen", urlopen)


def brave_payload(*results):
    return json.dumps({"web": {"results": [{"title": t, "description": d, "url": u} for t, d, u in results]}}).encode()


class StubSearch:
    def __init__(self, results, tenants=("acme",)):
        self.results, self.tenants, self.calls = results, set(tenants), []

    def allows(self, tenant):
        return tenant in self.tenants

    def __call__(self, question):
        self.calls.append(question)
        return list(self.results)


# --- Brave adapter -----------------------------------------------------------------------------

def test_brave_keeps_https_results_and_redacts_query_and_snippets(monkeypatch):
    seen = []
    fake_urlopen(monkeypatch, web_search, brave_payload(
        ("Port guide", "PostgreSQL uses 5432. Call 415-555-0142.", "https://example.org/pg"),
        ("Plain http", "Insecure page.", "http://example.org/x"),
        ("", "No title.", "https://example.org/y")), seen)
    results = BraveSearch("key", frozenset({"acme"}))("Email me at jane.doe@example.com about ports")
    assert [r["url"] for r in results] == ["https://example.org/pg"]
    assert "415-555-0142" not in results[0]["text"] and results[0]["document_id"] is None
    assert results[0]["citation_id"].startswith("web-") and results[0]["citation_id"].endswith(":c0")
    assert "jane.doe" not in seen[0].full_url and seen[0].get_header("X-subscription-token") == "key"


@pytest.mark.parametrize("body", [OSError("down"), b"not json", b"x" * 1_000_001])
def test_brave_failures_fall_back_to_no_web_results(monkeypatch, body):
    fake_urlopen(monkeypatch, web_search, body)
    assert BraveSearch("key", frozenset({"acme"}))("question") == []


def test_web_result_caps_untrusted_fields():
    r = web_result("t" * 500, "d" * 5000, "https://example.org/" + "p" * 2000)
    assert (len(r["title"]), len(r["text"]), len(r["url"])) == (240, 1200, 1000)


# --- Web evidence only fills empty writer slots, for opted-in tenants ---------------------------

def test_with_web_fills_only_empty_slots():
    web = [{"citation_id": f"web-{i}:c0"} for i in range(3)]
    search = StubSearch(web)
    assert with_web(EVIDENCE[:1], "q", "acme", search) == EVIDENCE[:1] + web[:2]
    full = EVIDENCE + [{"citation_id": "d3:c0"}]
    assert with_web(full, "q", "acme", search) == full
    assert search.calls == ["q"]  # a question answered locally never leaves the machine


def test_with_web_skips_tenants_that_did_not_opt_in():
    search = StubSearch([{"citation_id": "web-1:c0"}])
    assert with_web([], "q", "other", search) == [] and search.calls == []
    assert with_web([], "q", "acme", None) == []


def test_rag_query_cites_web_results_for_opted_in_tenant_only(app, client, headers):
    page = web_result("PostgreSQL ports", "PostgreSQL listens on port 5432.", "https://example.org/pg")
    app.state.searcher = StubSearch([page])
    r = client.post("/v1/rag/query", headers=headers["alice"], json={"question": "PostgreSQL port number"}).json()
    assert [c["url"] for c in r["citations"]] == ["https://example.org/pg"] and "5432" in r["answer"]
    r = client.post("/v1/rag/query", headers=headers["bob"], json={"question": "PostgreSQL port number"}).json()
    assert r["citations"] == [] and app.state.searcher.calls == ["PostgreSQL port number"]


# --- Ollama writer ------------------------------------------------------------------------------

def ollama_reply(content):
    return json.dumps({"message": {"content": content}, "prompt_eval_count": 50, "eval_count": 10}).encode()


def test_ollama_writer_shares_the_hosted_writer_checks(monkeypatch):
    seen = []
    fake_urlopen(monkeypatch, llm, ollama_reply("Receipts are due within thirty days [d1:c0]."), seen)
    draft = OllamaWriter("llama3.2").compose("When are receipts due?", EVIDENCE)
    assert draft.citations == ["d1:c0"] and (draft.input_tokens, draft.output_tokens) == (50, 10)
    sent = json.loads(seen[0].data)
    assert seen[0].full_url == "http://127.0.0.1:11434/api/chat" and sent["messages"][0]["content"] == llm.INSTRUCTIONS

    fake_urlopen(monkeypatch, llm, ollama_reply(ABSTAIN))
    assert OllamaWriter("llama3.2").compose("Parking?", EVIDENCE).answer == ABSTAIN_MESSAGE
    for bad in ("Due in 30 days [x9:c0].", "Due in 30 days.", ""):
        fake_urlopen(monkeypatch, llm, ollama_reply(bad))
        with pytest.raises(ValueError):
            OllamaWriter("llama3.2").compose("When are receipts due?", EVIDENCE)


def test_writers_only_see_the_first_writer_passages(monkeypatch):
    seen = []
    evidence = [{"citation_id": f"d{i}:c0", "text": f"passage {i}"} for i in range(5)]
    fake_urlopen(monkeypatch, llm, ollama_reply("Answer [d4:c0]."), seen)
    with pytest.raises(ValueError):  # d4 was never shown to the model
        OllamaWriter("llama3.2").compose("q", evidence)
    assert "d2:c0" in seen[0].data.decode() and "d3:c0" not in seen[0].data.decode()


@pytest.mark.parametrize("url,ok", [("http://127.0.0.1:11434", True), ("http://[::1]:11434", True),
                                    ("http://host.docker.internal:11434", True), ("http://10.0.0.5:11434", False),
                                    ("https://ollama.example.com", False), ("http://u:p@localhost:11434", False),
                                    ("http://localhost:11434/api", False)])
def test_ollama_base_url_is_local_only(url, ok):
    assert valid_base_url(url, local_only=True, allow_path=False) is ok
    if ok:
        OllamaWriter("llama3.2", url)
    else:
        with pytest.raises(ValueError):
            OllamaWriter("llama3.2", url)


# --- Writer pool ----------------------------------------------------------------------------------

def test_writer_pool_routes_by_release_and_caches(app, monkeypatch):
    settings = Settings("sqlite://", None, {}, "r" * 40, mode="ollama", ollama_model="llama3.2")
    pool = WriterPool(settings)
    with app.state.sessions() as s:
        s.add(ModelVersion(version="v2", artifact_sha256="a" * 64, provider_model="qwen2.5", registered_by="sam"))
        s.add(ModelVersion(version="v1", artifact_sha256="b" * 64, registered_by="sam"))
        s.commit()
        assert pool.for_version(s, "v2").model == "qwen2.5"
        assert pool.for_version(s, "v1").model == "llama3.2" and pool.for_version(s, None) is pool.get()
    assert pool.get("qwen2.5") is pool.get("qwen2.5")
    assert WriterPool(Settings("sqlite://", None, {}, "r" * 40)).get() is None


# --- Settings ---------------------------------------------------------------------------------------

def test_web_search_requires_named_tenants(monkeypatch):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "key")
    with pytest.raises(RuntimeError, match="CAPSTONE_WEB_SEARCH_TENANTS"):
        Settings.from_env()
    monkeypatch.setenv("CAPSTONE_WEB_SEARCH_TENANTS", "acme, beta ,")
    assert Settings.from_env().web_search_tenants == {"acme", "beta"}


@pytest.mark.parametrize("var,value", [("OLLAMA_URL", "http://10.0.0.5:11434"),
                                       ("OPENAI_BASE_URL", "http://inference.example.com/v1"),
                                       ("MODEL_BACKEND", "anthropic-remote")])
def test_settings_reject_unsafe_model_endpoints(monkeypatch, var, value):
    for k, v in ENV.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setenv(var, value)
    with pytest.raises(RuntimeError):
        Settings.from_env()


# --- `auto` embedder ----------------------------------------------------------------------------------

def test_auto_embedder_falls_back_to_hash_baseline(monkeypatch):
    def unavailable(name, **kwargs):
        raise OSError("weights not cached")
    monkeypatch.setattr(embeddings, "SentenceTransformerEmbedder", unavailable)
    monkeypatch.setattr(embeddings, "_cache", {})
    assert embeddings.get_embedder("auto").name == embeddings.HASH_MODEL


def test_auto_embedder_uses_cached_semantic_model_without_downloading(monkeypatch):
    calls = []
    def cached(name, **kwargs):
        calls.append((name, kwargs))
        return SimpleNamespace(name=name)
    monkeypatch.setattr(embeddings, "SentenceTransformerEmbedder", cached)
    monkeypatch.setattr(embeddings, "_cache", {})
    assert embeddings.get_embedder("auto").name == embeddings.DEFAULT_SEMANTIC_MODEL
    assert calls == [(embeddings.DEFAULT_SEMANTIC_MODEL, {"local_files_only": True})]


# --- Durable research graph ---------------------------------------------------------------------------

def test_durable_graph_drafts_with_the_jobs_release_writer_and_web_results(app):
    from langgraph.checkpoint.memory import InMemorySaver
    from capstone.agent import build_durable_graph, run_until_review

    class Pool:
        versions = []

        def for_version(self, session, version):
            self.versions.append(version)
            return SimpleNamespace(compose=lambda q, evidence: llm._finish(
                llm.Draft("", [], False, "routed", passages=llm._passages(evidence)),
                f"Port 5432 [{evidence[0]['citation_id']}]."))

    page = web_result("PostgreSQL ports", "PostgreSQL listens on port 5432.", "https://example.org/pg")
    graph = build_durable_graph(app.state.sessions, InMemorySaver(), writer=Pool(), searcher=StubSearch([page]))
    result = run_until_review(graph, {"id": "job-1", "tenant": "acme", "owner": "alice", "groups": ["engineering"],
                                      "question": "PostgreSQL port number", "model_version": "v2"})
    assert result["interrupted"] and result["citations"] == [page["citation_id"]]
    assert Pool.versions == ["v2"]  # resolved once, for the draft node only

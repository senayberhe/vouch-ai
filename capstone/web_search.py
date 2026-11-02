"""Optional bounded Brave Search adapter. It never fetches result URLs or exposes a URL tool to the agent.

Only tenants named in CAPSTONE_WEB_SEARCH_TENANTS use it, and only to fill passage slots that local
retrieval leaves empty, so a question answered by authorized documents never leaves the machine."""
from __future__ import annotations

import json
import hashlib
import logging
import urllib.parse
import urllib.request

from .llm import WRITER_PASSAGES
from .security import redact_pii

log = logging.getLogger(__name__)


class BraveSearch:
    endpoint = "https://api.search.brave.com/res/v1/web/search"

    def __init__(self, api_key: str, tenants: frozenset[str]):
        if not api_key or len(api_key) > 500:
            raise ValueError("A valid Brave Search API key is required")
        self.api_key = api_key
        self.tenants = frozenset(tenants)

    def allows(self, tenant: str) -> bool:
        return tenant in self.tenants

    def __call__(self, question: str) -> list[dict]:
        try:
            query = redact_pii(question[:500])
            url = self.endpoint + "?" + urllib.parse.urlencode({"q": query, "count": WRITER_PASSAGES, "safesearch": "strict"})
            request = urllib.request.Request(url, headers={"Accept": "application/json",
                                                           "X-Subscription-Token": self.api_key})
            with urllib.request.urlopen(request, timeout=8) as response:
                raw = response.read(1_000_001)
            if len(raw) > 1_000_000:
                raise ValueError("Search response too large")
            payload = json.loads(raw)
            results = payload.get("web", {}).get("results", [])
            evidence = [web_result(str(item.get("title", "")), str(item.get("description", "")),
                                   str(item.get("url", ""))) for item in results[:WRITER_PASSAGES]]
            return [e for e in evidence if e]
        except Exception as exc:
            # Web access is an optional source. Preserve local retrieval when the provider is down.
            log.warning("Web search unavailable (%s)", type(exc).__name__)
            return []


def web_result(title: str, description: str, link: str) -> dict | None:
    """One search result as evidence. Snippets are untrusted text: capped and PII-redacted like uploads."""
    title, description, link = title[:240], description[:1200], link[:1000]
    if not title or not description or not link.startswith("https://"):
        return None
    return {"citation_id": "web-" + hashlib.sha256(link.encode()).hexdigest()[:16] + ":c0",
            "document_id": None, "title": redact_pii(title), "text": redact_pii(description),
            "url": link, "score": 0.0}


def with_web(evidence: list[dict], question: str, tenant: str, searcher) -> list[dict]:
    """Local evidence first; web results fill only the writer slots it leaves empty.
    The extractive answer and the LLM writers therefore see the same sources."""
    room = WRITER_PASSAGES - len(evidence)
    if searcher is None or room <= 0 or not searcher.allows(tenant):
        return evidence
    return evidence + searcher(question)[:room]

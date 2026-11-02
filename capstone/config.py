"""Environment configuration. No built-in production credentials."""
import json
import os
from urllib.parse import urlsplit
from dataclasses import dataclass, field
from pathlib import Path

# Hosts allowed for plain-HTTP model endpoints: this machine, or the Docker Desktop host.
LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "host.docker.internal"})


def valid_base_url(url: str, *, local_only: bool, allow_path: bool) -> bool:
    """An http(s) base URL with no credentials, query or fragment. Plain HTTP only for LOCAL_HOSTS."""
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
        return False
    if parsed.query or parsed.fragment or (not allow_path and parsed.path not in {"", "/"}):
        return False
    return host in LOCAL_HOSTS if (local_only or parsed.scheme == "http") else True


@dataclass(frozen=True)
class Settings:
    database_url: str
    redis_url: str | None
    api_tokens: dict
    routing_secret: str
    mode: str = "offline"
    openai_model: str | None = None
    openai_base_url: str | None = None
    ollama_model: str | None = None
    ollama_url: str = "http://127.0.0.1:11434"
    web_search_key: str | None = None
    web_search_tenants: frozenset = frozenset()
    max_chars: int = 6000
    release_tenant: str | None = None
    graph: str = "offline"
    # Challenge 3: public keys of trusted CI attesters ({key_id: PEM}) and the artifact store root.
    attestation_keys: dict = field(default_factory=dict)
    artifact_root: str | None = None
    evidence_max_age_hours: int = 168
    # Accounts: browser origin users visit (cookie Secure flag, Google redirect URI) and optional Google sign-in.
    public_url: str = "http://127.0.0.1:8090"
    session_hours: int = 24
    google_client_id: str | None = None
    google_client_secret: str | None = None
    invite_only: bool = False

    @property
    def cookie_secure(self) -> bool:
        return self.public_url.startswith("https://")

    @classmethod
    def from_env(cls):
        raw = os.getenv("CAPSTONE_TOKENS_JSON", "{}")
        tokens = json.loads(raw)
        if not isinstance(tokens, dict) or not tokens:
            raise RuntimeError("CAPSTONE_TOKENS_JSON must contain configured identities")
        if not all(len(k) >= 24 for k in tokens):
            raise RuntimeError("Bearer tokens must have at least 24 characters")
        key = os.getenv("CAPSTONE_ROUTING_SECRET", "")
        if len(key) < 32:
            raise RuntimeError("CAPSTONE_ROUTING_SECRET must have >=32 characters")
        mode = os.getenv("MODEL_BACKEND", "offline")
        if mode not in {"offline", "openai", "ollama"}:
            raise RuntimeError("MODEL_BACKEND must be offline, openai, or ollama")
        openai_model = os.getenv("OPENAI_MODEL") or None
        if mode == "openai" and not openai_model:
            raise RuntimeError("MODEL_BACKEND=openai needs OPENAI_MODEL")
        openai_base_url = os.getenv("OPENAI_BASE_URL") or None
        if openai_base_url and not valid_base_url(openai_base_url, local_only=False, allow_path=True):
            raise RuntimeError("OPENAI_BASE_URL must use HTTPS or a trusted local HTTP host")
        ollama_model = os.getenv("OLLAMA_MODEL") or None
        ollama_url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
        if mode == "ollama" and not ollama_model:
            raise RuntimeError("MODEL_BACKEND=ollama needs OLLAMA_MODEL")
        if not valid_base_url(ollama_url, local_only=True, allow_path=False):
            raise RuntimeError("OLLAMA_URL must be a local HTTP(S) base URL without credentials or path")
        web_search_key = os.getenv("BRAVE_SEARCH_API_KEY") or None
        web_search_tenants = frozenset(t.strip() for t in os.getenv("CAPSTONE_WEB_SEARCH_TENANTS", "").split(",")
                                       if t.strip())
        # Web search sends questions off this machine, so each tenant must be opted in by name.
        if web_search_key and not web_search_tenants:
            raise RuntimeError("BRAVE_SEARCH_API_KEY needs CAPSTONE_WEB_SEARCH_TENANTS (comma-separated tenants)")
        graph = os.getenv("CAPSTONE_GRAPH", "offline")
        if graph not in {"offline", "langgraph"}:
            raise RuntimeError("CAPSTONE_GRAPH must be offline or langgraph")
        session_hours = int(os.getenv("CAPSTONE_SESSION_HOURS", "24"))
        if not 1 <= session_hours <= 720:
            raise RuntimeError("CAPSTONE_SESSION_HOURS must be between 1 and 720")
        return cls(
            database_url=os.getenv("DATABASE_URL", "sqlite:///./capstone.db"),
            redis_url=os.getenv("REDIS_URL") or None,
            api_tokens=tokens,
            routing_secret=key,
            mode=mode,
            openai_model=openai_model,
            openai_base_url=openai_base_url,
            ollama_model=ollama_model,
            ollama_url=ollama_url,
            web_search_key=web_search_key,
            web_search_tenants=web_search_tenants,
            release_tenant=os.getenv("CAPSTONE_RELEASE_TENANT") or None,
            graph=graph,
            attestation_keys=_attestation_keys(),
            artifact_root=os.getenv("CAPSTONE_ARTIFACT_ROOT") or None,
            evidence_max_age_hours=int(os.getenv("CAPSTONE_EVIDENCE_MAX_AGE_HOURS", "168")),
            public_url=os.getenv("CAPSTONE_PUBLIC_URL", "http://127.0.0.1:8090").rstrip("/"),
            session_hours=session_hours,
            google_client_id=os.getenv("GOOGLE_CLIENT_ID") or None,
            google_client_secret=os.getenv("GOOGLE_CLIENT_SECRET") or None,
            invite_only=os.getenv("CAPSTONE_INVITE_ONLY", "0").lower() in {"1", "true", "yes"},
        )


def _attestation_keys() -> dict:
    raw = os.getenv("CAPSTONE_ATTESTATION_KEYS")
    path = os.getenv("CAPSTONE_ATTESTATION_KEYS_FILE")
    if path:
        raw = Path(path).read_text()
    keys = json.loads(raw) if raw else {}
    if not isinstance(keys, dict):
        raise RuntimeError("CAPSTONE_ATTESTATION_KEYS must map key ids to PEM public keys")
    return keys

"""Aggregate metrics without raw prompts, tenants or user-id labels."""
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

REQUESTS = Counter("capstone_http_requests_total", "Requests", ["route", "method", "status"])
DURATION = Histogram("capstone_http_duration_seconds", "Request duration", ["route", "method"])
JOBS = Counter("capstone_worker_jobs_total", "Worker completions", ["status"])
# LLM writer: outcome is ok, abstained, invalid (failed validation) or error (API call failed).
LLM_CALLS = Counter("capstone_llm_calls_total", "LLM writer calls", ["model", "outcome"])
LLM_TOKENS = Counter("capstone_llm_tokens_total", "LLM tokens billed", ["model", "kind"])
LLM_LATENCY = Histogram("capstone_llm_latency_seconds", "LLM call latency", ["model"],
                        buckets=(0.25, 0.5, 1, 2, 4, 8, 16, 32))


def metric_bytes():
    return generate_latest()

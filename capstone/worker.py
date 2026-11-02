"""Single-process worker; multiple replicas use DB claiming/fencing. No raw-data logs."""
import logging
import os
import time
from .config import Settings
from .db import database
from .jobs import claim_job, finish_job, reconcile_reviews
from .queueing import RedisNotifier
from .telemetry import JOBS

log = logging.getLogger("capstone.worker")


def process_once(session_factory, engine="offline", pool=None, writer=None, graph=None, searcher=None):
    with session_factory() as session:
        claim = claim_job(session)
    if not claim:
        return False
    if writer is None and pool is not None and graph is None:
        with session_factory() as session:
            writer = pool.for_version(session, claim.get("model_version"))
    with session_factory() as session:
        success = finish_job(session, claim, engine=engine, writer=writer, graph=graph, searcher=searcher)
    JOBS.labels(status="completed" if success else "retry").inc()
    return True


def main():
    logging.basicConfig(level=logging.INFO)
    settings = Settings.from_env()
    _, sessions = database(settings.database_url)
    notifier = RedisNotifier(settings.redis_url) if settings.redis_url else None
    engine = os.getenv("CAPSTONE_GRAPH", "langgraph")
    from .llm import WriterPool
    pool = WriterPool(settings)
    durable = None
    searcher = None
    if settings.web_search_key:
        from .web_search import BraveSearch
        searcher = BraveSearch(settings.web_search_key, settings.web_search_tenants)
    if engine == "langgraph":
        # Durable checkpoints: an interrupted research thread survives worker and API restarts.
        from .agent import build_durable_graph
        from .checkpoints import checkpoint_url, open_checkpointer
        saver, _close = open_checkpointer(checkpoint_url(settings.database_url))
        durable = build_durable_graph(sessions, saver, writer=pool if pool.enabled else None, searcher=searcher)
    while True:
        try:
            if durable is not None:
                with sessions() as session:
                    reconcile_reviews(session, durable)
            if not process_once(sessions, engine=engine, pool=pool, graph=durable, searcher=searcher):
                if notifier:
                    notifier.wait(2)
                else:
                    time.sleep(2)
        except Exception:
            log.error("Worker iteration failed (no raw exception logged)")
            time.sleep(2)


if __name__ == "__main__":
    main()

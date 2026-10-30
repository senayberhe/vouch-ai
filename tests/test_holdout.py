"""Dataset integrity and isolation checks; retrieval quality is reported without tuning on holdout."""
from capstone.rag_benchmark import BENCHMARK, load, principal, run_benchmark


def test_holdout_is_disjoint_and_gold_is_authorized():
    dev_corpus, dev_cases = load()
    corpus, cases = load(BENCHMARK / 'holdout')
    assert len(cases) == 30
    assert len({c['id'] for c in cases}) == len(cases)
    assert not ({c['question'] for c in cases} & {c['question'] for c in dev_cases})
    assert not ({d['text'] for d in corpus['documents']} & {d['text'] for d in dev_corpus['documents']})
    assert not ({d['doc_id'] for d in corpus['documents']} & {d['doc_id'] for d in dev_corpus['documents']})
    documents = {d['doc_id'] + ':c0': d for d in corpus['documents']}
    for case in cases:
        who = principal(corpus, case['principal'])
        for citation in case['relevant']:
            doc = documents[citation]
            assert doc['tenant_id'] == who.tenant and doc['group'] in who.groups
    assert sum(bool(c['relevant']) for c in cases) == 18
    assert {c['category'] for c in cases} >= {'ordinary', 'paraphrase', 'exact_id', 'unauthorized', 'insufficient'}


def test_holdout_never_leaks_in_any_retrieval_mode():
    report = run_benchmark(models=['hash-128'], directory=BENCHMARK / 'holdout')
    assert report['questions'] == 30
    assert all(m['cross_tenant_or_group_leaks'] == 0 for m in report['results']['hash-128'].values())

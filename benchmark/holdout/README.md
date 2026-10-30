# Frozen retrieval holdout v1

Authored October 29, 2026, after the development benchmark and its cosine cutoff (0.35) were established. This set has 30 questions over 10 new synthetic documents: 18 answerable and 12 requiring abstention. Document IDs, text, and questions are disjoint from the development set. It includes ordinary questions, paraphrases, exact identifiers, missing facts, unauthorized access, and authorized positive controls for restricted documents.

Run without altering retrieval settings:

```bash
uv run python -m capstone.rag_benchmark \
  --models hash-128 sentence-transformers/all-MiniLM-L6-v2 \
  --dataset-dir benchmark/holdout --report-name rag_holdout
```

The semantic run requires the `semantic` extra and cached approved model weights. `--models hash-128` runs offline without those weights. Reports are written separately to `artifacts/rag_holdout.{json,md}` and include the dataset hash.

Keep v1 unchanged. Once its results inform a model or threshold change, treat it as a regression set and author a new unseen version for the next generalization measurement. No retrieval thresholds were adjusted after this run. These labels were authored with AI assistance and have not had independent human validation. Review them before using this set as release evidence.

The first MiniLM hybrid run found all 18 answerable sources and declined 8 of 12 no-answer questions, with zero unauthorized chunks returned. The small, simple corpus also gave BM25 perfect recall, so this set does not demonstrate semantic superiority. Returned unrelated authorized passages still count as abstention failures even when access isolation works. This evaluates retrieval, not generated answer factuality or prompt-injection resistance.

CI runs the hash baseline and fails on any unauthorized retrieval. It records quality metrics without imposing new score thresholds derived from this set. The signed model-release evaluator continues to use the development benchmark; this holdout is separate evidence, not an additional signed release gate.

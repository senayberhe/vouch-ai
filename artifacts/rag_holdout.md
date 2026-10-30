Questions: 30 (18 answerable, 12 should abstain), documents: 10, dataset sha256 `d2253ec898d0…`

| Model | Mode | Recall@3 | MRR | Paraphrase R@3 | Exact-ID R@3 | Abstention | p50 ms | p95 ms | Leaks |
|---|---|---|---|---|---|---|---|---|---|
| hash-128 | bm25 | 1.000 | 1.000 | 1.000 | 1.000 | 0.083 | 0.25 | 0.37 | 0 |
| hash-128 | dense | 1.000 | 0.963 | 1.000 | 1.000 | 0.000 | 0.41 | 0.57 | 0 |
| hash-128 | hybrid | 1.000 | 1.000 | 1.000 | 1.000 | 0.000 | 0.48 | 0.54 | 0 |
| all-MiniLM-L6-v2 | bm25 | 1.000 | 1.000 | 1.000 | 1.000 | 0.083 | 0.26 | 0.29 | 0 |
| all-MiniLM-L6-v2 | dense | 1.000 | 1.000 | 1.000 | 1.000 | 0.667 | 8.83 | 9.99 | 0 |
| all-MiniLM-L6-v2 | hybrid | 1.000 | 1.000 | 1.000 | 1.000 | 0.667 | 8.73 | 9.50 | 0 |

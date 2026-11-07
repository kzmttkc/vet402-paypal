# Eval

Both runs below were on 2026-11-07 (UTC). The per-type rows and the summary line matched.

`npm run eval` does not download a model. `eval/run.ts` installs a constant vector (`Float32Array.of(1, 0, 0)`) unless `EMBEDDER=transformers`. The real run set that variable. `HF_TOKEN`, `HF_ACCESS_TOKEN`, and `HUGGING_FACE_HUB_TOKEN` were unset. `@huggingface/transformers` 4.3.2 then loaded `onnx-community/all-MiniLM-L6-v2-ONNX`, the ONNX build of all-MiniLM-L6-v2 named in `src/verify/score.ts`, from `https://huggingface.co/`. The hub answered the unauthenticated request with HTTP 307 and `x-hf-warning: unauthenticated`, and still served the files. They landed in `.cache/transformers` (97MB, gitignored). That run took about 52 seconds. The mock run took under a second.

## Mock (`npm run eval`)

```
export sha256=c0fea21a1b47 settled mix honest=4132 shape=728 paid_4xx=736 paid_5xx=121 late=241 (+ empty_200, injection, instruction_in_field at 12 each: not in export)
type                    n  capture  void  human
honest                 124      124     0      0
shape                   27        0    27      0
paid_4xx                27        0    27      0
paid_5xx                 9        0     9      0
late                    13        0     0     13
empty_200               12        0    12      0
injection               12        0    12      0
instruction_in_field    12        0     0     12
eval cases=236 false_approvals=0 correct_approval_rate=100.0% human_rate=10.6% injection_flips=0 rail_captures=124 ledger_chain=ok
```

## all-MiniLM-L6-v2 (`EMBEDDER=transformers npm run eval`)

```
export sha256=c0fea21a1b47 settled mix honest=4132 shape=728 paid_4xx=736 paid_5xx=121 late=241 (+ empty_200, injection, instruction_in_field at 12 each: not in export)
type                    n  capture  void  human
honest                 124      124     0      0
shape                   27        0    27      0
paid_4xx                27        0    27      0
paid_5xx                 9        0     9      0
late                    13        0     0     13
empty_200               12        0    12      0
injection               12        0    12      0
instruction_in_field    12        0     0     12
eval cases=236 false_approvals=0 correct_approval_rate=100.0% human_rate=10.6% injection_flips=0 rail_captures=124 ledger_chain=ok
```

| | Count |
|---|---|
| Cases | 236 |
| False approvals (a bad delivery that was captured) | 0 |
| Correct deliveries approved | 124 / 124 = 100.0% |
| Sent to a person | 25 / 236 = 10.6% (13 late + 12 instruction-in-field) |
| Injection flips (dirty body vs its clean twin) | 0 |
| Mock-rail captures | 124 |
| Ledger chain | ok |

The mock embedder returns one fixed vector, so its cosine is 1 and it clears the pass line (0.9) whenever a case reaches the score. The downloaded model also captured all 124 honest cases and captured nothing else. On this set the embedding did not move a case between capture, void, and human.

## How the set was built

The frozen file is `data/observatory_export.csv`, fetched 2026-11-07T03:31:32.455Z from `https://vet402.com/api/v1/observatory/export.csv?days=365` (no key). The meta file records 22,071 rows and sha256 `c0fea21a1b476ec853588f1215da174d29cfe0d823ad0877719fe75cbb232169`. Of those rows, 13,893 have `status=settled`.

`eval/mix.ts` counts only settled rows whose `http_status_paid` is three digits, and assigns each row to one bucket, in this order:

| Bucket | Rule | Rows in the export |
|---|---|---|
| paid_5xx | 5xx | 121 |
| paid_4xx | 4xx | 736 |
| late | 2xx and `latency_ms` > 15,000 | 241 |
| shape | 2xx and `l2_schema=mismatch` | 728 |
| honest | 2xx and `l2_schema=match` | 4,132 |

Those five buckets sum to 5,958. The other 7,935 settled rows are left out. A row is left out when the paid status is not three digits, or when a 2xx is not late and `l2_schema` is neither `match` nor `mismatch` (the code names `no_declaration` and `not_checked` as having no ground truth). The case mix follows the 5,958, not all 13,893.

The runner then builds 200 cases from those five shares, at least 6 of each type, by largest remainder (`MEASURED_TOTAL=200`, `MIN_PER_TYPE=6` in `eval/run.ts`). That is the 124 / 27 / 27 / 9 / 13 split above.

The export has no column for an empty 200, for injected instructions, or for an instruction sitting inside a field the condition did ask for. Those three types are not measured. Each is added at a fixed 12 (`FIXED_PER_TYPE`). 200 + 36 = 236.

Only `honest` is labeled a correct delivery. Every other type must not be captured on its own. The generator seed is `20261107`. Each case is one item at 2,000 cents, seller `seller.eval`, autonomy autopilot, through the in-memory PayPal rail. The judge's order is HTTP status, then empty, JSON, shape, values, latency, then the score (`src/verify/judge.ts`). An instruction inside a declared field is sent to a person after the score, whatever number came back.

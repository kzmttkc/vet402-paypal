# vet402 × PayPal

It places one PayPal authorization on a data job, checks each delivery against a condition fixed before the hold, and captures only the part that passed.

It is for a person who lets an agent buy data and needs the payment to stop when the body is empty, the wrong shape, an HTTP error, or late.

The seller line on the approval card, and the mix of failures in the eval, are counted from 13,893 settled purchases in the public vet402 export frozen on 2026-11-07. The pass/fail rules themselves are a fixed spec, registered before the hold. [EVAL.md](EVAL.md) records which rows were counted and which were left out.

## Two minutes

The public demo URL is TBD as of 2026-11-07. Nothing in this repository is a hosted demo. The mock screen moves no money.

| Do this | It shows |
|---|---|
| Public demo | TBD |
| `npm install && npm run dev`, then open http://127.0.0.1:5173 | the hold screen, in English. The banner says this session is on the mock rail and no money moves. `?lang=ja` switches the screen to Japanese. Amounts and ids stay as they are. |
| **Play the same job both ways** | left **CAPTURED**, right **VOIDED**, and "$0. Your agent didn't lose a cent." |
| Type a job, pick a budget and Careful / Balanced / Autopilot, then **Show the approval card** | the breakdown, the condition id, the seller line ("n paid purchases, x% matched the promised shape, y% errors after payment"), and "May I place a hold of $X until each delivery checks out?" |
| **Place the hold**, then **Deliver the records** / **Deliver nothing** / **Deliver late** | PASS → captured, FAIL → voided, or UNSURE → a person, then "Captured $a of $b hold. $c released." |
| Scroll to **With a person** | sample holds in the grid. **Reset samples** puts them back. |
| Scroll to **Activity** | order, authorization, capture, and refund ids, the verdict, and the ledger hash |
| **Void every open hold** | every open authorization is voided |

`npm test` needs no key and no network. `npm run dev` serves the API on port 8787 and the screen on port 5173. Leave `PAYPAL_ENV` unset and the screen stays on the mock.

## May it pay?

All of these must hold, checked in code before PayPal is called:

```
amount ≤ remaining          remaining = budget − (open authorizations + captured)
seller ∈ allowedSellers
now < expiresAt
¬revoked
day total + amount ≤ dailyCap      month total + amount ≤ monthlyCap
¬emergencyStop
```

At capture time, expiry, revocation, the authorization's own expiry, and the stop switch are checked again, and the ledger chain is verified.

Autonomy: **Careful** (a person approves every job), **Balanced** (automatic up to a threshold), **Autopilot** (automatic within budget and caps). The threshold, autonomy, caps, seller list, and expiry can only be tightened.

Amounts are integer cents computed by code from the job plan. The judge's output has no amount field. The scorer returns one number in [0, 1], or nothing.

## How it fails

| What goes wrong | What happens |
|---|---|
| Over budget, seller not allowed, mandate expired or revoked, over a cap | refused before any PayPal call, written to the ledger |
| Same request retried | the same `PayPal-Request-Id` returns the first result. Nothing is charged twice. |
| Seller returns 4xx / 5xx after payment | void |
| 200 with an empty body, `{}`, `[]`, `null`, or no records | void |
| Wrong shape, wrong types, impossible values, bad formats | void |
| Delivery slower than the condition allows | a person decides |
| Scorer answers with text, an object, NaN, or throws | a person decides |
| Instruction text in a field the condition did not ask for | treated as data. The verdict matches the delivery without that text. |
| Instruction text inside a declared field of an otherwise valid delivery | not captured. A person decides. |
| Authorization expired or voided before capture | capture refused, written to the ledger |
| Emergency stop | no new authorization or capture. Every open authorization is voided. |
| A ledger line was rewritten | `verifyChain()` fails, capture is not called, the stop switch engages |
| Unsure | do not pay |

The judge's order is HTTP status, then empty, JSON, shape, values, latency, then the score.

## Not escrow

The buyer's funds stay with PayPal under a standard authorization. This code decides whether to capture, void, or ask a person, and keeps a hash-chained record of why. It does not lock tokens in a contract.

## x402 auth-capture and PayPal Orders

The x402 column follows the auth-capture page at <https://docs.x402r.org/x402-integration/auth-capture> as it read on 2026-11-07. That page's default path (`autoCapture: false`) locks tokens in `AuthCaptureEscrow`. This program does not call that contract. The PayPal column is what `src/rail/sandbox.ts` calls: Orders v2 and Payments v2, `intent=AUTHORIZE`.

| x402 auth-capture, two-phase | This program |
|---|---|
| Facilitator submits the client's signature. `AuthCaptureEscrow.authorize` locks tokens in the escrow contract. | `POST /v2/checkout/orders` with `intent=AUTHORIZE`, then `POST /v2/checkout/orders/{id}/authorize`. PayPal places the hold. |
| The server returns the resource. | The seller's body is judged against the condition fixed before the hold. |
| `captureAuthorizer` calls `capture`. Tokens move to the receiver. | `POST /v2/payments/authorizations/{id}/capture` for the sum that passed, with `final_capture=true`. PayPal releases the rest. |
| `void` returns the escrowed tokens to the client. | `POST /v2/payments/authorizations/{id}/void`. |
| After capture, `refund` inside `refundDeadline`. | `POST /v2/payments/captures/{id}/refund`. |
| After `captureDeadline`, the client calls `reclaim` on the contract. | Not built. PayPal expires the authorization on its own clock. A sandbox read-back includes `expiration_time`. |

`autoCapture: true` on that page charges immediately and has no void step. This program does not use that path. Every order it creates has `intent=AUTHORIZE`.

## Eval

On 2026-11-07, `npm run eval` (constant-vector mock, no download) and `EMBEDDER=transformers npm run eval` (all-MiniLM-L6-v2, ONNX build `onnx-community/all-MiniLM-L6-v2-ONNX`, from huggingface.co, no token) printed the same line:

`eval cases=236 false_approvals=0 correct_approval_rate=100.0% human_rate=10.6% injection_flips=0 rail_captures=124 ledger_chain=ok`

False approvals: 0. Correct deliveries approved: 124/124. Sent to a person: 10.6%. The measured mix follows settled rows in the frozen export. Empty bodies, injected text, and an instruction inside a declared field have no column there, so each of those types is a fixed 12. Detail, both full tables, and the row counts: [EVAL.md](EVAL.md).

## Sandbox record

`docs/sandbox-run.json` is one pass against `api-m.sandbox.paypal.com` on 2026-11-07. Run id `run-20261107034254`, started 2026-11-07T03:42:54.620Z, finished 2026-11-07T03:43:41.883Z. The file says every id and status was read back with GET after the call that made it. No live charge. The card is PayPal's public test card `4012888888881881`.

| Case | What the file records |
|---|---|
| a | Authorize $20.00 and capture $20.00. Order `2ES415235E815594L` COMPLETED. Authorization `4C53391800550971K` CAPTURED. Capture `30045445DC8145221` COMPLETED, `final_capture` true. |
| b | Authorize $50.00 and capture $12.50 with `final_capture=true`. Authorization `27224167CR8866647` reads back CAPTURED. Capture `9X732969JW2516540` COMPLETED. This is `gates.gate1` (passed). |
| c | Authorize $30.00, void, then a capture of $10.00 is refused `AUTHORIZATION_VOIDED` (HTTP 422). Authorization `00N1620869359422G` reads back VOIDED. |
| d | Authorize $15.00, capture $15.00, refund $15.00. Capture `39R97432469952814` reads back REFUNDED. Refund `6RK25870EY4268935` COMPLETED. |
| gate 2 | A vaulted card (payment token `7p2918019c535510e`, Visa, last digits 1881) authorizes and captures $25.00 with the buyer away. Passed. A saved PayPal balance still needs the buyer once: setup token `7JL562195V043941L` is `PAYER_ACTION_REQUIRED`. |
| buyer approval | Order `92J5084030716252J` is `PAYER_ACTION_REQUIRED` and `approved: false`. |

`npm run sandbox:run` writes that file. It reads `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET` from `.env` (gitignored; this repository does not contain them). The code talks only to `api-m.sandbox.paypal.com`. Any other host, or `PAYPAL_ENV` set to anything other than `sandbox` or `mock`, is refused.

`npm run dev` with `PAYPAL_ENV=sandbox` uses the same screen. **Activity** lists the sandbox ids. `npm run demo:sandbox` captures one honest delivery and voids an empty one. `npm run test:sandbox` is the live sandbox test file.

## MCP

`npm run mcp` speaks MCP on stdin and stdout. The rail is the mock. It needs no PayPal key.

| Tool | What it does |
|---|---|
| `plan_job` | Drafts the work from a brief. Amounts are computed in code. |
| `place_hold` | Authorizes the hold. It refuses unless `confirm` is `true`. |
| `check_delivery` | Judges one body. It does not capture or void. |
| `settle_job` | Captures what passed, or voids. It refuses unless `confirm` is `true`. |
| `emergency_stop` | Voids every open authorization. |
| `get_activity` | Ledger lines: order, authorization, capture, void, hash. |

The first score downloads `all-MiniLM-L6-v2` into `.cache/transformers` from the public Hugging Face repo named above. Set `ANTHROPIC_API_KEY` only if Claude should draft the plan or replace the score (`claude-sonnet-4-5`, unless `ANTHROPIC_MODEL` is set). The key is not printed. Prices stay computed in code. The eval in [EVAL.md](EVAL.md) did not call Claude.

Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vet402-paypal": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/vet402-paypal"
    }
  }
}
```

Restart Claude Desktop after saving. Ask it to plan a job, then place the hold only after the person agrees (`confirm: true`).

## Other commands

| Command | What it does |
|---|---|
| `npm test` | the suite. No keys, no network. |
| `npm run eval` | 236 cases. Summary line quoted above. |
| `EMBEDDER=transformers npm run eval` | the same 236 cases with the downloaded model. |
| `npm run sellers` | totals of the frozen export and the approval-card line for the top sellers |
| `npm run fetch:export` | a fresh copy of the public export, frozen to `data/` with its sha256 |
| `npm run typecheck` | `tsc`, both the server and the screen |
| `npm run build && npm start` | the built screen. `PORT` defaults to 8787. |

## Layout

```
src/rail/      PayPal rail contract, mock rail, sandbox rail, rail choice from PAYPAL_ENV
src/policy/    mandate, pay rules, autonomy, caps, spend book, stop switch
src/ledger/    SHA-256 hash-chained ledger
src/verify/    fixed conditions (content-hash ids), judge, pluggable scorer
src/sellers/   export parser, per-seller track record, frozen loader
src/engine/    the path from request to capture / void / human
src/server/    HTTP API: plan, approve, settle, review queue, activity, stop
src/mcp/       MCP tools over the mock rail
web/           the screen (React, Vite, TypeScript, AG Grid)
eval/          failure mix, case generator, runner
scripts/       sandbox run, sandbox demo, seller totals, export fetch
docs/          sandbox-run.json
```

## License

MIT. The file is `LICENSE` at the repository root. GitHub shows that license in the About section when the repository is public.

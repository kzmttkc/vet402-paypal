# vet402 × PayPal

PayPal Agent Ready and Store Sync support an agent buying physical goods. An agent also buys digital deliveries: data, an answer from an API, a report. This work extends the same supervised and automatic idea to those digital deliveries, and captures only after the check. Store Sync publishes a physical catalog to an AI and does not cover digital goods ([Store Sync overview](https://docs.paypal.ai/growth/agentic-commerce/store-sync/overview)). Seller Protection also leaves digital goods out ([PayPal Seller Protection](https://www.paypal.com/c2/webapps/mpp/ua/seller-protection)).

Pay per truth: one hold on the job, then capture only the records that passed and release the rest.
Scam my agent: a browser page where a judge sends a fake delivery and sees the outcome, the reason, and $0.00 when it fails.
The seller's paid history decides the hold: one authorization for the whole job, or five records at a time.

It is for a person who lets an agent buy data and needs the payment to stop when the body is empty, the wrong shape, an HTTP error, or late.

The seller line on the approval card is counted from 13,893 settled purchases in the public vet402 export frozen on 2026-11-07. The eval's failure mix is the share of 5,958 of those rows: a settled purchase with a paid 4xx or 5xx, a 2xx later than 15 seconds, or a 2xx whose `l2_schema` is `match` or `mismatch` (4,132 + 728 + 736 + 121 + 241). The other 7,935 settled rows are left out of that ratio. The bodies in the eval are generated. The pass/fail rules themselves are a fixed spec, registered before the hold. [EVAL.md](EVAL.md) records the buckets.

## Two minutes

The public demo URL is TBD as of 2026-11-07. Nothing in this repository is a hosted demo. The mock screen moves no money.

| Do this | It shows |
|---|---|
| Public demo | TBD |
| `npm install && npm run dev`, then open http://127.0.0.1:5173 | the hold screen, in English. The banner says this session is on the mock rail and no money moves. `?lang=ja` switches the screen to Japanese. Amounts and ids stay as they are. |
| **Play** | Pay per truth. Each record lands PASS or FAIL, the captured amount counts up, and the released amount climbs with it. The first passing record reads CAPTURED. While Qwen3 is downloading, the screen says `AI model loading: n%`. |
| Type or speak a job, pick a budget and Supervised / Supervised under a limit / Automatic, then **Show the plan** | what is being bought, how many, the price, and the seller's track record in one line. **Continue to approval** opens the sheet. With no `PAYPAL_CLIENT_ID` the sheet says the approval is simulated. |
| **Approve the hold**, then **Deliver the records** / **Deliver nothing** / **Deliver late** | each part shows PASS, FAIL, or UNSURE and one sentence of why, then "Captured $a of $b hold. $c released." |
| Scroll to **With a person** | sample holds in the grid. **Reset samples** puts them back. |
| Scroll to **Activity** | one plain sentence per PayPal step. Order, authorization, and capture ids are inside **Details**. |
| **Void every open hold** | every open authorization is voided |

`npm test` needs no key and no network. `npm run dev` serves the API on port 8787 and the screen on port 5173. Leave `PAYPAL_ENV` unset and the screen stays on the mock.

On 2026-11-07, Playwright's headless Chromium opened the static page (`npm run build:static`, then `npm run screens:static`) at 375px wide, clicked **Play**, and read the first `CAPTURED`. The clock started when navigation started. It took **0.58s**. The target is under 10 seconds. That run does not launch the Google Chrome app.

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

Autonomy, in PayPal's words: **Supervised** (a person approves every job), **Supervised under a limit** (automatic up to a threshold), **Automatic** (automatic within budget and caps). The threshold, autonomy, caps, seller list, and expiry can only be tightened. The internal ids stay `careful`, `balanced`, and `autopilot`.

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

## Digital deliveries

PayPal Agent Ready and Store Sync support an agent buying physical goods. An agent also buys digital deliveries: data, an answer from an API, a report. This work extends the same supervised and automatic idea to those digital deliveries, and captures only after the check. Store Sync is for a physical catalog ([Store Sync overview](https://docs.paypal.ai/growth/agentic-commerce/store-sync/overview)). Seller Protection leaves digital goods out ([PayPal Seller Protection](https://www.paypal.com/c2/webapps/mpp/ua/seller-protection)).

A seller with enough paid history, a high shape-match rate, and few errors after payment is held once for the whole job. A new or uncertain seller is held five records at a time: capture what passed, then the next hold. The plan says which, in one line.

## PayPal button

Supervised approval uses PayPal JavaScript SDK v6. The script is `https://www.sandbox.paypal.com/web-sdk/v6/core` (HTTP 200 on 2026-11-07, cache tag `paypal-web-sdk-6.72.0`). The control is PayPal's own `<paypal-button>`, started with `createPayPalOneTimePaymentSession`. The client id is read only from the environment variable `PAYPAL_CLIENT_ID`. This repository does not contain one. When it is unset, or `PAYPAL_ENV` is not `sandbox`, the approval sheet is a simulated screen and says so. Setup reference: [Set up JavaScript SDK v6](https://developer.paypal.com/sdk/js/set-up). The page does not redraw PayPal's logo or colors outside that official button.

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

`npm run eval` does not download a model. On 2026-11-07 it printed:

`eval cases=248 false_approvals=0 correct_approval_rate=100.0% human_rate=10.1% injection_flips=0 rail_captures=124 ledger_chain=ok`

False approvals: 0. Correct deliveries approved: 124/124. Sent to a person: 25/248 (10.1%). Empty bodies, injected text, an instruction inside a declared field, and a shape-valid delivery whose names are not companies have no column in the export, so each of those types is a fixed 12. Detail: [EVAL.md](EVAL.md).

`SCORER=transformers npm run eval` (`onnx-community/Qwen3-0.6B-ONNX`, q4f16, no token, no `ANTHROPIC_API_KEY`) printed that same 248-case line. Qwen3 voided all 12 off-topic deliveries. One warm CPU score of a single name took 417 ms. The static page does not download this model (about 570MB). It scores with the MiniLM embedding and says so. That embedding floor captures a shape-valid delivery even when the names are not companies, so it does not print this line.

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

The first score downloads `onnx-community/Qwen3-0.6B-ONNX` (q4f16, about 570MB) into `.cache/transformers` from the public Hugging Face repo. No hub token is sent. Set `ANTHROPIC_API_KEY` only if Claude should draft the plan or replace that score (`claude-sonnet-4-5`, unless `ANTHROPIC_MODEL` is set). The key is not printed. Prices stay computed in code. The eval in [EVAL.md](EVAL.md) did not call Claude.

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
| `npm run eval` | 248 cases. Summary line quoted above. No download. |
| `SCORER=transformers npm run eval` | the same 248 cases with Qwen3. Downloads the public model. |
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

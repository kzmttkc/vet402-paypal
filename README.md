# vet402 × PayPal

Fund your agent's data job with PayPal. It buys only from sellers with a real track record, checks every delivery against the promise, and captures only what passed.

No signup. The screen and `npm test` use the mock rail. Money moves only when you point the same screen at the PayPal sandbox.

## Two minutes

| Do this | You see |
|---|---|
| `npm install && npm run dev`, then open http://127.0.0.1:5173 | the hold screen, in English, on your phone width |
| **Play the same job both ways** | left **CAPTURED**, right **VOIDED** and "$0. Your agent didn't lose a cent." |
| Type a job, pick a budget and Careful / Balanced / Autopilot, then **Show the approval card** | the breakdown, the condition id, the seller line ("n paid purchases, x% matched the promised shape, y% errors after payment"), and "May I place a hold of $X until each delivery checks out?" |
| **Place the hold**, then **Deliver the records** / **Deliver nothing** / **Deliver late** | PASS → captured, FAIL → voided, or UNSURE → human, then "Captured $a of $b hold. $c released." |
| Scroll to **With a person** | sample holds in the grid; **Reset samples** puts them back |
| Scroll to **Activity** | order, authorization, capture, and refund ids, the verdict, and the ledger hash |
| **Void every open hold** | every open authorization is voided |

## Try it on the PayPal sandbox

The screen is the same. `PAYPAL_ENV=sandbox` swaps the mock rail for the sandbox. Keys stay in `.env`, which is gitignored. This repo does not contain them.

1. In a PayPal sandbox app (developer.paypal.com), copy the client id and secret into `.env` as `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`.
2. `npm install && npm run build && npm start` — the process listens on `PORT` (8787 if unset). On Render, the build command is `npm install && npm run build` and the start command is `npm start`.
3. Open the URL. Play a job, or place a hold and deliver the records.
4. **Activity** lists the sandbox order, authorization, capture, and refund ids. The card buyer is PayPal's public test card; no buyer login.

`npm run dev` does the same locally, with the API on port 8787 and the screen on port 5173. Leave `PAYPAL_ENV` unset and the screen stays on the mock.

> The engine runs on the real PayPal sandbox (`PAYPAL_ENV=sandbox`) or on an in-memory mock with the same contract. `npm test` runs with no keys and no network; the live sandbox checks are a separate command.

## What it is

One PayPal authorization per job (for example "collect 50 company records", $20–200). The agent buys the pieces, code checks each delivery against a condition fixed before the money was held, and the job ends in one of three ways:

| Outcome | When | PayPal call |
|---|---|---|
| capture | every check passed | `capture` for the sum of passed items, `final_capture=true` (the rest is released) |
| void | nothing passed | `void` |
| human | the judge is unsure (late, score in the unsure band, scorer gave no usable answer) | none until a person decides |

A defect found later is a `refund`.

## Try it

| Do this | You see |
|---|---|
| `npm install && npm test` | all tests pass, no keys, no network |
| `npm run eval` | 224 deliveries through the full path, ending in `eval cases=224 false_approvals=0 …` |
| `npm run sellers` | totals of the frozen public export and the approval-card line for the top sellers |
| `npm run fetch:export` | a fresh copy of the public export frozen to `data/` with its sha256 |
| `npm run typecheck` | `tsc` with no errors |
| `npm run demo:sandbox` | the engine on the real PayPal sandbox: an honest delivery is captured, an empty one is voided, with the PayPal ids read back |
| `npm run sandbox:run` | one pass of authorize / capture / partial capture / void / refund / vaulted card, written to `docs/sandbox-run.json` |
| `npm run test:sandbox` | the live sandbox tests |

The sandbox commands read `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from `.env` (sandbox app credentials from developer.paypal.com). The code only talks to `api-m.sandbox.paypal.com`; any other host, or `PAYPAL_ENV` set to anything but `sandbox` or `mock`, is refused.

## How the buyer pays (sandbox)

| Path | Buyer login | How |
|---|---|---|
| Card | none | the order is created without a payment source, then authorized with a card in the authorize body. The sandbox uses PayPal's public test card `4012888888881881`. |
| Saved card (buyer not present) | none after saving | Vault v3: setup token with the card → payment token → authorize with `card.vault_id` and `stored_credential` (merchant-initiated, unscheduled, subsequent). |
| PayPal balance | once | `createOrderForBuyerApproval()` returns the approve link. Steps: 1. open the link in a browser, 2. log in with a sandbox personal account (developer.paypal.com → Testing tools → Sandbox accounts), 3. approve, 4. call `authorize(orderId)` on a rail built without a `paymentSource`. Saving a PayPal account for later (Vault) also needs this one approval. |

## Sandbox gates (2026-11-07)

| Gate | Result | Where |
|---|---|---|
| Capture less than authorized | passes: $12.50 captured on a $50.00 authorization with `final_capture=true`; the authorization reads back `CAPTURED`, the rest is released | `docs/sandbox-run.json` → `gates.gate1`, `cases.b` |
| Pay with a saved method while the buyer is away | passes for a vaulted card (authorize and capture with no buyer present). A saved PayPal account needs the buyer to approve once (`PAYER_ACTION_REQUIRED`) | `docs/sandbox-run.json` → `gates.gate2` |

## May the agent pay?

All of these must hold, checked in code before PayPal is called:

```
amount ≤ remaining          remaining = budget − (open authorizations + captured)
seller ∈ allowedSellers
now < expiresAt
¬revoked
day total + amount ≤ dailyCap      month total + amount ≤ monthlyCap
¬emergencyStop
```

At capture time expiry, revocation, the authorization's own expiry and the stop switch are checked again, and the ledger chain is verified.

Autonomy: **Careful** (a person approves every job), **Balanced** (automatic up to a threshold), **Autopilot** (automatic within budget and caps). The threshold, autonomy, caps, seller list and expiry can only be tightened.

Amounts are integer cents computed by code from the job plan. The judge's output has no amount field, and the scorer returns one number in [0, 1] or nothing.

## How it fails

| What goes wrong | What happens |
|---|---|
| Over budget, seller not allowed, mandate expired or revoked, over a cap | refused before any PayPal call, written to the ledger |
| Same request retried | the same `PayPal-Request-Id` returns the first result; nothing is charged twice |
| Seller returns 4xx / 5xx after payment | void |
| 200 with an empty body, `{}`, `[]`, `null`, or no records | void |
| Wrong shape, wrong types, impossible values, bad formats | void |
| Delivery slower than the condition allows | a person decides |
| Scorer answers with text, an object, NaN, or throws | a person decides |
| Instruction text in a field the condition did not ask for | treated as data; the verdict is the same as without it |
| Instruction text inside a declared field of an otherwise valid delivery | not captured; a person decides |
| Authorization expired or voided before capture | capture refused, written to the ledger |
| Emergency stop | no new authorization or capture; every open authorization is voided |
| A ledger line was rewritten | `verifyChain()` fails, capture is not called, the stop switch engages |
| Unsure | do not pay |

## Seller track record

`src/sellers/` reads the vet402 public observatory export (`https://vet402.com/api/v1/observatory/export.csv?days=365`, no key) and builds, per paid endpoint: settled purchases, declared-shape match / mismatch, and 4xx / 5xx after payment. The copy used here is frozen in `data/` (fetched 2026-11-07, sha256 `c0fea21a…`, 22,071 rows). The loader refuses a file whose hash changed.

## Eval

`eval/` builds deliveries in the mix of failure types seen on settled purchases in that export (honest, wrong shape, 4xx and 5xx after payment, late), plus fixed sets of empty 200s and injected instructions, which the export has no column for. Each case runs through policy → mock PayPal → judge → ledger. Reported: false approvals, approval rate for correct deliveries, share sent to a person, and whether injected text changed any verdict.

## Not escrow

Nothing here holds anyone's money. The buyer's funds stay with PayPal under a standard authorization; this code only decides whether to capture, void, or ask a person, and keeps a tamper-evident record of why.

## Layout

```
src/rail/      PayPal rail contract, mock rail, sandbox rail, rail choice from PAYPAL_ENV
src/policy/    mandate, pay rules, autonomy, caps, spend book, stop switch
src/ledger/    SHA-256 hash-chained ledger
src/verify/    fixed conditions (content-hash ids), judge, pluggable scorer
src/sellers/   export parser, per-seller track record, frozen loader
src/engine/    the path from request to capture / void / human
src/server/    HTTP API: plan, approve, settle, review queue, activity, stop
web/           the screen (React, Vite, TypeScript)
eval/          failure mix, case generator, runner
scripts/       sandbox run, sandbox demo, seller totals, export fetch
test-sandbox/  live sandbox tests (npm run test:sandbox)
docs/          sandbox-run.json (ids and statuses read back from the sandbox)
```

## MCP

`npm run mcp` speaks MCP on stdin and stdout. The rail is the mock: no PayPal key. Tools:

| Tool | What it does |
|---|---|
| `plan_job` | Drafts the work from a brief. Amounts are computed in code. |
| `place_hold` | Authorizes the hold. Refuses unless `confirm` is `true`. |
| `check_delivery` | Judges one body. Does not capture or void. |
| `settle_job` | Captures what passed, or voids. Refuses unless `confirm` is `true`. |
| `emergency_stop` | Voids every open authorization. |
| `get_activity` | Ledger lines: order, authorization, capture, void, hash. |

The first score downloads `all-MiniLM-L6-v2` into `.cache/transformers`. Set `ANTHROPIC_API_KEY` only if you want Claude to draft the plan or score; the key is not printed, and prices are still computed in code.

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

Restart Claude Desktop after saving. Ask it to plan a job, then place the hold only after you agree (`confirm: true`).

## License

MIT

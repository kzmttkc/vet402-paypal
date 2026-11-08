An agent that pays for data gets a broken answer about one time in eight (1,826 of 13,893 settled purchases in vet402's export frozen on 2026-11-07). Here the agent pays the seller through PayPal only for the part that passed. A spending mandate limits what an agent may spend. This limits what it pays for after the delivery arrives.
PayPal Orders v2 places the hold (`intent=AUTHORIZE`). Payments v2 then captures only the sum that passed the check, and `final_capture=true` closes the rest of the hold.
Example: at that rate, an agent spending $2,000 a month on data pays about $263 of it for broken answers, if every purchase costs the same.

## Inspiration

In the Play demo, the agent holds $50 with PayPal and pays only for what passed: Captured $37.00 of $50.00. $13.00 released. Those 1,826 are a paid 4xx (736), a paid 5xx (121), a shape mismatch that was not also late (728), or a 2xx later than 15 seconds (241).

Built during the hackathon: the PayPal authorize, partial capture, void, and vault path, and the judge that decides them. The vet402 export it counts is existing public data.

## What it does

It places one PayPal authorization for a data job. It buys from a seller whose paid history is on the approval card: how many purchases settled, what share matched the promised shape, and what share erred after payment. That sentence is counted from the frozen export.

Each delivery is checked in code: HTTP status, empty body, JSON, shape, values, latency, then one score in [0, 1]. Capture keeps the part that passed and releases the rest (`final_capture=true`). A total miss is a void. Late, an unsure score, or an instruction inside a declared field goes to a person. The buyer's funds stay at PayPal. This program does not hold them.

PayPal's agentic commerce describes supervised and automatic shopping. An agent also buys digital deliveries: data, an answer from an API, a report. This work applies the same supervised and automatic idea to those digital deliveries, and captures only after the check. A seller with a strong paid history is authorized once for the job. A new or uncertain seller is authorized five records at a time. Supervised approval is PayPal's own button (JavaScript SDK v6). With no `PAYPAL_CLIENT_ID`, the sheet says it is simulated.

## How I built it

The rail is PayPal Orders v2 and Payments v2 with `intent=AUTHORIZE`: create the order, authorize, capture or void the authorization, refund a capture. The same calls exist on an in-memory mock. `npm test` uses the mock and opens no network.

The seller line and the eval mix read `data/observatory_export.csv` (22,071 rows, sha256 `c0fea21a1b476ec853588f1215da174d29cfe0d823ad0877719fe75cbb232169`). The loader refuses the file if the hash changes. Amounts are integer cents from the job plan. The judge cannot name an amount.

The default score is a local Qwen3-0.6B (ONNX, q4f16, no key). Claude drafts a plan or replaces that score only when `ANTHROPIC_API_KEY` is set. The published eval did not call Claude. The static page is too small for the 570MB weights. It uses the recorded Qwen3 answers plus all-MiniLM-L6-v2, and captures only when both agree. It says so.

AG Grid is the list where a person decides: each held delivery is a row, and Capture or Void settles that PayPal authorization.

`render.yaml` is the one-click deploy setting for the server version on Render's free plan (Deploy to Render button in the README). It sets `SCORER=embedding`, so starting the service does not download Qwen3.

`npm run mcp` exposes plan, hold, check, settle, and stop on the mock. Hold and settle refuse unless `confirm` is true.

## Challenges

The export has no column for an empty 200, for injected text, for an instruction sitting in a field the condition did ask for, or for a shape-valid delivery whose names are not companies. Those four types are a fixed 12 each in the eval, not a measured share. The mix itself is the share of 5,958 settled rows: 4,132 with `l2_schema=match`, 728 with `l2_schema=mismatch`, 736 paid 4xx, 121 paid 5xx, and 241 paid 2xx later than 15 seconds. The other 7,935 of the 13,893 settled rows fall outside those five buckets: the paid status is not three digits, or a 2xx is not late and `l2_schema` is neither `match` nor `mismatch`. I did not split that 7,935 any further. The bodies in the eval are generated. [EVAL.md](../EVAL.md) spells that out.

Structural checks decide most failures before the score runs. Twelve shape-valid deliveries in the 248 use names Qwen3 had already answered "no" to, so voiding those 12 is that list. On 60 names that were not used to build the list (30 companies and 30 that are not), Qwen3 alone was right on 49 of 60. A capture now needs that yes and a second check: the name has to be nearer a fixed list of company exemplars than the calibration phrase Iron Nail. On the recorded answers, 0 of the 30 that are not companies were captured, 14 of 30 companies were captured, and 25 of 60 went to a person. Monday Forecast, Miso Ramen, and Wireless Mouse are three of the nine that a yes alone would have captured. They now go to a person. Both checks saying no still voids. The 248-case line comes from the eval's fixed stand-in, not a model. The model numbers are the 60 above. Detail is [EVAL.md](../EVAL.md).

With `ANTHROPIC_API_KEY` set, Claude (`claude-sonnet-5-5`) scores the same 60 names: on 2026-11-08 Claude alone was right on 53 of 60, and with the second check 0 of the 30 that are not companies were captured, 14 of 30 companies were captured, 0 companies were voided (Qwen3 voided 2), and 25 of 60 went to a person ([held-out-claude-sonnet-5-5-2026-11-08.json](held-out-claude-sonnet-5-5-2026-11-08.json)).

A capture smaller than the authorization, and a vaulted card while the buyer is away, had to be read back from the sandbox rather than trusted from the response I had just sent. A saved PayPal balance still stops at `PAYER_ACTION_REQUIRED`. I left that order unapproved.

## Accomplishments

`npm run eval` on 2026-11-07: 248 cases, 0 false approvals, 100.0% of correct deliveries captured (124/124), 10.1% sent to a person (25/248). Ledger chain ok. Injected text outside a declared field flipped no verdict. That 0 is the stand-in for the 12 names already answered "no". On the 60 held-out names, both checks captured 14 of 30 companies and 0 of the 30 that are not. 25 of 60 went to a person. Qwen3 alone had been right on 49, and a yes alone would have captured 9 non-companies. One warm CPU score of a single name took 417 ms.

Sandbox run `run-20261107034254` (2026-11-07T03:42:54.620Z to 2026-11-07T03:43:41.883Z, `api-m.sandbox.paypal.com`). Every id below was read back with GET. Detail is `docs/sandbox-run.json`.

- $12.50 captured on a $50.00 authorization (`27224167CR8866647` reads CAPTURED).
- A voided authorization (`00N1620869359422G`) refuses a later capture with `AUTHORIZATION_VOIDED`.
- A vaulted Visa (last digits 1881, payment token `7p2918019c535510e`) authorizes and captures $25.00 with the buyer away.

## What I learned

The pay/no-pay bar and the seller sentence can be counted from production purchases, and the export still cannot see an empty body or a hidden instruction. Those have to be added by hand.

x402 auth-capture, on the page I read on 2026-11-07, locks tokens in `AuthCaptureEscrow` on the two-phase path. The PayPal authorization I call is a hold at PayPal. The verbs line up. The custody does not. The mapping is in the README.

## What's next

The public demo is https://kzmttkc.github.io/vet402-paypal/ . The sandbox rail moves the test charges, and the mock needs no key.

## Built with

TypeScript, Node.js 20, React, Vite, Hono, AG Grid, Vitest, PayPal Orders v2 and Payments v2, Model Context Protocol SDK, `@huggingface/transformers`.

## Tools

AI used, and what it did:

| Tool | Use |
|---|---|
| Claude Code | I used it to write and revise the TypeScript in this repository. |
| Cursor | I used it to edit this repository, run the suite, and review the diff. |
| Grok | I used Grok inside Cursor to run the eval, read the Devpost rules, and draft EVAL.md, the README, this text, and the video script. |
| Qwen3-0.6B | The default score. The ONNX build `onnx-community/Qwen3-0.6B-ONNX` (q4f16, about 570MB) is downloaded from huggingface.co. No key. |
| all-MiniLM-L6-v2 | The static page's score, because Qwen3 is too large for that page. The ONNX build `onnx-community/all-MiniLM-L6-v2-ONNX` is downloaded from huggingface.co. No key. |
| Claude (optional) | If `ANTHROPIC_API_KEY` is set, `claude-sonnet-5-5` (or `ANTHROPIC_MODEL`) drafts the job plan or replaces the local score. Amounts stay in code. The published eval did not call Claude. |

## Testing instructions

No real money moves. The mock never calls PayPal. The sandbox calls only `api-m.sandbox.paypal.com`, and only with a sandbox app's own client id and secret. This repository does not contain those secrets. `.env` is gitignored.

The server at https://vet402-paypal.onrender.com keeps PayPal on the mock and scores with the embedding floor, the same line the screen shows. /api/health returns {"ok":true,"rail":"mock",...,"model":{"phase":"embedding",...}}. On the free plan, the first request takes about 50 seconds while the instance wakes.

### Mock, no key

1. `npm install`
2. `npm test` (no network)
3. `npm run dev`
4. Open http://127.0.0.1:5173
5. **Play.** Records land PASS or FAIL. The captured amount counts up. The first pass reads CAPTURED. If Qwen3 is still downloading, the screen says `AI model loading: n%`. When the download finishes, the same process scores with Qwen3. No restart.
6. **Show the plan.** The seller line is counted from the frozen export. The levels read Supervised, Supervised under a limit, and Automatic. **Continue to approval**. With no `PAYPAL_CLIENT_ID` the sheet says the approval is simulated.
7. **Approve the hold**, then **Deliver the records**, **Deliver nothing**, or **Deliver late**. Each part has a verdict and one sentence. **Activity** says what happened. The ids are under Details.
8. **Void every open hold.** Open authorizations void.
9. Optional: `npm run eval`. The summary line should match [EVAL.md](../EVAL.md): 248 cases and `false_approvals=0`. It does not download a model.

### Sandbox test card

1. In a PayPal sandbox app at developer.paypal.com, copy the client id and secret into `.env`:

   ```
   PAYPAL_ENV=sandbox
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   ```

2. `npm install && npm run build && npm start` (or `npm run dev` with the same `.env`). The process listens on `PORT`, 8787 if unset.
3. Open the URL. The banner says this session talks to the PayPal sandbox.
4. Supervised approval uses PayPal's own button (JavaScript SDK v6) when `PAYPAL_CLIENT_ID` is set. The buyer approves in PayPal's screen. Paths that do not open that button still authorize with PayPal's public test card on the server: number `4012888888881881`, expiry `2030-12`, security code `123`, name `Sandbox Buyer` (`src/rail/select.ts`).
5. Play a job, or approve a hold and deliver the records. **Activity** says what happened in one sentence. Order, authorization, and capture ids are under Details.
6. `npm run sandbox:run` repeats authorize, partial capture, void, refund, and a vaulted card, and writes `docs/sandbox-run.json`. `npm run test:sandbox` is the live test file.

A saved PayPal balance needs one approval in a browser. The recorded order `92J5084030716252J` was left at `PAYER_ACTION_REQUIRED`. The vaulted-card path does not need that login.

## License

MIT. File: `LICENSE` at the repository root. That is the license GitHub shows in About when the repository is public.

## Video

https://youtu.be/7sQ_moJ23OU (2:49, English voice and subtitles). The script is under three minutes, in English, and lists the screens to record: [VIDEO.md](VIDEO.md). It uses no copyrighted music. Footage is the program running on a desktop browser.

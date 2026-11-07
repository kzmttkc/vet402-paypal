# Devpost draft

Paste the sections below into the PayPal AI Hackathon form. Rules checked on 2026-11-07 at <https://paypalaihackathon.devpost.com/rules>.

| Rule | Where it is answered |
|---|---|
| Public repository, OSS license visible in About | `LICENSE` is MIT at the repository root. GitHub shows it in About once the repository is public. This draft does not publish the repository. |
| Text description | Project story below |
| A judge can run it | [Testing instructions](#testing-instructions). The mock needs no key. A hosted demo is not required. The public demo URL is TBD. |
| Tools | [Tools](#tools) |
| Demonstration video, under 3 minutes, on YouTube, in English | [Video](#video). The YouTube link is TBD. The script is [VIDEO.md](VIDEO.md). |
| English | This file, the README, EVAL.md, and the video script are in English. |

## Inspiration

The frozen vet402 export (fetched 2026-11-07) has 13,893 settled purchases. Thousands of them came back as a 4xx, a 5xx, a shape mismatch, or later than 15 seconds. Capturing at the moment the agent buys would pay for those. I wanted the hold to stay in place until the body passed a condition that was already fixed.

## What it does

It places one PayPal authorization for a data job. It buys from a seller whose paid history is on the approval card: how many purchases settled, what share matched the promised shape, and what share erred after payment. That sentence is counted from the frozen export.

Each delivery is checked in code: HTTP status, empty body, JSON, shape, values, latency, then one score in [0, 1]. Capture keeps the part that passed and releases the rest (`final_capture=true`). A total miss is a void. Late, an unsure score, or an instruction inside a declared field goes to a person. The buyer's funds stay at PayPal. This program does not hold them.

## How I built it

The rail is PayPal Orders v2 and Payments v2 with `intent=AUTHORIZE`: create the order, authorize, capture or void the authorization, refund a capture. The same calls exist on an in-memory mock. `npm test` uses the mock and opens no network.

The seller line and the eval mix read `data/observatory_export.csv` (22,071 rows, sha256 `c0fea21a1b476ec853588f1215da174d29cfe0d823ad0877719fe75cbb232169`). The loader refuses the file if the hash changes. Amounts are integer cents from the job plan. The judge cannot name an amount.

The default score is a local embedding, all-MiniLM-L6-v2. Claude drafts a plan or replaces that score only when `ANTHROPIC_API_KEY` is set. The published eval did not call Claude.

`npm run mcp` exposes plan, hold, check, settle, and stop on the mock. Hold and settle refuse unless `confirm` is true.

## Challenges

The export has no column for an empty 200, for injected text, or for an instruction sitting in a field the condition did ask for. Those three types are a fixed 12 each in the eval, not a measured share. 7,935 of the 13,893 settled rows fall outside the five measured buckets: the paid status is not three digits, or a 2xx is not late and `l2_schema` is neither `match` nor `mismatch`. I did not split that 7,935 any further. [EVAL.md](../EVAL.md) spells that out.

On 2026-11-07 the constant-vector mock and the downloaded MiniLM printed the same 236-case table. The embedding did not move a case. Structural checks decide most failures before the score runs.

A capture smaller than the authorization, and a vaulted card while the buyer is away, had to be read back from the sandbox rather than trusted from the response I had just sent. A saved PayPal balance still stops at `PAYER_ACTION_REQUIRED`. I left that order unapproved.

## Accomplishments

Eval, both scorers, 2026-11-07: 236 cases, 0 false approvals, 100.0% of correct deliveries captured (124/124), 10.6% sent to a person. Ledger chain ok. Injected text outside a declared field flipped no verdict.

Sandbox run `run-20261107034254` (2026-11-07T03:42:54.620Z to 2026-11-07T03:43:41.883Z, `api-m.sandbox.paypal.com`). Every id below was read back with GET. Detail is `docs/sandbox-run.json`.

- $12.50 captured on a $50.00 authorization (`27224167CR8866647` reads CAPTURED).
- A voided authorization (`00N1620869359422G`) refuses a later capture with `AUTHORIZATION_VOIDED`.
- A vaulted Visa (last digits 1881, payment token `7p2918019c535510e`) authorizes and captures $25.00 with the buyer away.

## What I learned

The pay/no-pay bar and the seller sentence can be counted from production purchases, and the export still cannot see an empty body or a hidden instruction. Those have to be added by hand.

x402 auth-capture, on the page I read on 2026-11-07, locks tokens in `AuthCaptureEscrow` on the two-phase path. The PayPal authorization I call is a hold at PayPal. The verbs line up. The custody does not. The mapping is in the README.

## What's next

The public demo URL is TBD. The YouTube link is TBD. I have not pointed this screen at a live PayPal account. The sandbox rail remains the path that moves a test charge. The mock remains the path with no key.

## Built with

TypeScript, Node.js 20, React, Vite, Hono, AG Grid, Vitest, PayPal Orders v2 and Payments v2, Model Context Protocol SDK, `@huggingface/transformers`.

## Tools

AI used, and what it did:

| Tool | Use |
|---|---|
| Claude Code | I used it to write and revise the TypeScript in this repository. |
| Cursor | I used it to edit this repository, run the suite, and review the diff. |
| Grok | I used Grok inside Cursor to run the eval, read the Devpost rules, and draft EVAL.md, the README, this text, and the video script. |
| all-MiniLM-L6-v2 | The default score. The ONNX build `onnx-community/all-MiniLM-L6-v2-ONNX` is downloaded from huggingface.co. No key. The 2026-11-07 eval ran it once. |
| Claude (optional) | If `ANTHROPIC_API_KEY` is set, `claude-sonnet-4-5` (or `ANTHROPIC_MODEL`) drafts the job plan or replaces the embedding score. Amounts stay in code. The published eval did not call Claude. |

## Testing instructions

No real money moves. The mock never calls PayPal. The sandbox calls only `api-m.sandbox.paypal.com`, and only with a sandbox app's own client id and secret. This repository does not contain those secrets. `.env` is gitignored.

### Mock, no key

1. `npm install`
2. `npm test` (no network)
3. `npm run dev`
4. Open http://127.0.0.1:5173
5. **Play the same job both ways.** The left side reads CAPTURED. The right side reads VOIDED.
6. **Show the approval card.** The seller line is counted from the frozen export.
7. **Place the hold**, then **Deliver the records**, **Deliver nothing**, or **Deliver late**.
8. **Void every open hold.** Open authorizations void.
9. Optional: `npm run eval`. The summary line should match [EVAL.md](../EVAL.md). `EMBEDDER=transformers npm run eval` downloads the public MiniLM and, on 2026-11-07, printed the same line.

### Sandbox test card

1. In a PayPal sandbox app at developer.paypal.com, copy the client id and secret into `.env`:

   ```
   PAYPAL_ENV=sandbox
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   ```

2. `npm install && npm run build && npm start` (or `npm run dev` with the same `.env`). The process listens on `PORT`, 8787 if unset.
3. Open the URL. The banner says this session talks to the PayPal sandbox.
4. The buyer is PayPal's public test card, sent by the server. No buyer login. Number `4012888888881881`, expiry `2030-12`, security code `123`, name `Sandbox Buyer` (`src/rail/select.ts`).
5. Play a job, or place a hold and deliver the records. **Activity** lists the sandbox order, authorization, capture, and refund ids.
6. `npm run sandbox:run` repeats authorize, partial capture, void, refund, and a vaulted card, and writes `docs/sandbox-run.json`. `npm run test:sandbox` is the live test file.

A saved PayPal balance needs one approval in a browser. The recorded order `92J5084030716252J` was left at `PAYER_ACTION_REQUIRED`. The vaulted-card path does not need that login.

## License

MIT. File: `LICENSE` at the repository root. That is the license GitHub shows in About when the repository is public.

## Video

Not uploaded. The YouTube link is TBD. The script is under three minutes, in English, and lists the screens to record: [VIDEO.md](VIDEO.md). It uses no copyrighted music. Footage is the program running on a desktop browser, plus one terminal line.

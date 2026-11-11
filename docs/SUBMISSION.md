About one in eight paid data answers comes back broken. This agent lets PayPal take money only for the part that passed.
It places a PayPal hold first (Orders v2, `intent=AUTHORIZE`), checks every record, then captures only what passed (Payments v2, `final_capture=true`) and releases the rest.
Real sandbox run, 2026-11-10: 40 of 50 records passed, and PayPal captured $40.00 and released $10.00 with no person in the loop (capture `5DC328323E0217202`, COMPLETED).

## Inspiration

1,826 of 13,893 settled purchases in vet402's export (frozen 2026-11-07) were broken. Built during the hackathon: the PayPal authorize, partial capture, void, and vault path, and the judge that decides them. The export is existing public data.

## What it does

It is for a person who lets an agent buy data and needs the payment to stop when the body is empty, the wrong shape, an HTTP error, or late.

Each delivery is checked in code: HTTP status, empty body, JSON, shape, values, latency, then one score in [0, 1]. The passing part is captured and the rest released. A total miss is a void. Late or unsure goes to a person in an AG Grid list. The hold itself is approved with PayPal's own button (JavaScript SDK v6). The buyer's funds stay at PayPal.

## How I built it

- PayPal Orders v2 and Payments v2: authorize, capture, void, refund. The same calls run on a mock, so `npm test` opens no network.
- Amounts are integer cents from the job plan. The judge cannot name an amount.
- AG Grid: one row per hold, Capture all or Void all.
- `npm run mcp` exposes plan, hold, check, settle, and stop. Hold and settle need `confirm`.

## Challenges

A yes from Qwen3 was not enough. On 60 held-out names it was right on 49 alone. A capture now also needs the name nearer company exemplars than a fixed non-company phrase (Iron Nail), so Monday Forecast and Miso Ramen go to a person.

## Accomplishments

- `npm run eval` (2026-11-07): 248 cases, 0 false approvals, 124/124 correct deliveries captured, 25/248 (10.1%) to a person.
- 60 held-out names: 14 of 30 companies and 0 of the 30 that are not were captured.
- Sandbox run `run-20261107034254`: $12.50 captured on a $50.00 authorization, a void that refuses capture (`AUTHORIZATION_VOIDED`), a vaulted Visa capturing $25.00 with the buyer away.
- Every id is in `docs/sandbox-run.json` and `docs/sandbox-judged-run.json`: https://github.com/kzmttkc/vet402-paypal

## What I learned

x402 auth-capture locks tokens in `AuthCaptureEscrow`. A PayPal authorization is a hold at PayPal. The verbs line up. The custody does not.

## Built with

TypeScript, Node.js 20, React, Vite, Hono, AG Grid, Vitest, PayPal Orders v2 and Payments v2, Model Context Protocol SDK, `@huggingface/transformers`.

## Tools

Claude Code wrote the TypeScript. Cursor edited, ran the suite, and reviewed the diff. Grok in Cursor ran the eval and drafted the README, this text, and the video script. Qwen3-0.6B is the default local score and all-MiniLM-L6-v2 the second check, both from huggingface.co, no key. Claude is optional (`ANTHROPIC_API_KEY`). The published eval did not call Claude.

## Testing instructions

No real money moves. Fastest: open https://kzmttkc.github.io/vet402-paypal/ and press **Play**.

Mock, no key: `npm install`, `npm test`, `npm run dev`, open http://127.0.0.1:5173, then **Show the plan**, **Continue to approval**, **Approve the hold**, and **Deliver the records**, **Deliver nothing**, or **Deliver late**. Ids are under Details in **Activity**.

Sandbox: set `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET` in `.env`. `npm run sandbox:run` repeats the Nov 7 cases. `node --env-file=.env --import tsx scripts/sandbox-judged.ts` reruns the Nov 10 capture.

## License

MIT, `LICENSE` at the repository root.

## Video

https://youtu.be/a69W_SbAdYY (2:49, English voice and subtitles). No copyrighted music.

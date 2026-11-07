# Video script

Under three minutes. English. No music. No extra logos beyond what the screen already draws. Do not open `.env` or any key. Judges are not asked to watch past three minutes (PayPal AI Hackathon rules, read 2026-11-07), so the cut should end by 2:40.

Spoken lines only. Clicks happen under the line, not instead of it.

**0:00** PayPal Agent Ready and Store Sync support an agent buying physical goods. An agent also buys digital deliveries: data, an answer from an API, a report. This work extends the same supervised and automatic idea to those digital deliveries, and captures only after the check. Store Sync is for physical goods (https://docs.paypal.ai/growth/agentic-commerce/store-sync/overview). Seller Protection leaves digital goods out (https://www.paypal.com/c2/webapps/mpp/ua/seller-protection). Then: Pay per truth. Fifty company records. One hold of fifty dollars. Each line lands pass or fail. The captured counter climbs, and so does the amount released. Thirteen fail. The line reads: Captured $37.00 of $50.00. $13.00 released.

**0:12** Scam my agent. An empty body. A field of the wrong type. A missing field. A year out of range. An instruction written into the name. A late reply. Send each one. None of them are captured. The amount stays at $0.00.

**0:27** Qwen3, after the loading line is gone. Send "Not a company": the shape is valid, and the name is not a company. Qwen3 answers no. The outcome is VOID. Captured stays $0.00. The embedding floor would have captured this one.

**0:42** This is the approval card. The seller is a company-data outlet, not an HTTP header API. The line is a track record: how many purchases settled, what share matched the promised shape, and what share erred after payment. A short record is discounted. The failure mix in the eval is the share of 5,958 settled rows that had a paid 4xx, a paid 5xx, a late 2xx, or a shape check. It is not a share of all 13,893. The line under the question says whether this seller is held once, or in parts.

**0:57** The condition was fixed before the hold. It asks for company records: a name, an ISO country code, an employee count, a founding year, and a source URL.

**1:08** Eval, 2026-11-07. 248 cases. Zero false approvals. The line is `eval cases=248 false_approvals=0 correct_approval_rate=100.0% human_rate=10.1% injection_flips=0 rail_captures=124 ledger_chain=ok`.

**1:20** Sandbox, from `docs/sandbox-run.json`. These ids were read back with GET. Authorization `27224167CR8866647` is CAPTURED. Capture `9X732969JW2516540` is $12.50 of a $50.00 hold, final capture. Authorization `00N1620869359422G` is VOIDED. A later capture on it was refused.

**1:35** This is the stop. Void every open hold. It voids open authorizations, and it will not open a new one.

**1:48** Try it in two minutes. The public URL is still TBD. Locally: `npm install`, `npm run dev`, then open 127.0.0.1 port 5173. Press Play. While Qwen3 downloads, the screen says `AI model loading: n%`. The first pass reads CAPTURED. The mock moves no money. Supervised approval is PayPal's button when `PAYPAL_CLIENT_ID` is set, and a simulated sheet when it is not.

**2:05** The hold stays at PayPal. This page only decides whether to capture, void, or ask a person.

Stop by 2:20. Leave the end card up until 2:30 if the clicks ran long.

## Screens to record

| Order | What is on screen | Notes |
|---|---|---|
| 1 | Pay per truth, after **Play**, with the final line `Captured $37.00 of $50.00. $13.00 released.` | Opening frame. Hold it until the 0:00 line finishes. |
| 2 | Scam my agent, after **Send to my agent** on an empty body or a wrong type | Outcome is `VOID` or `HUMAN`, never `CAPTURE`. Captured amount is `$0.00`. |
| 3 | The same panel, **Not a company**, after `AI model loading` has gone | Qwen3 voids a shape-valid delivery. Outcome `VOID`. Amount `$0.00`. About 15 seconds. |
| 4 | Plan, after **Show the plan**, on Supervised | Seller line is one sentence. The level reads Supervised, Supervised under a limit, or Automatic. |
| 5 | The same card, scrolled to the condition | Shape, ranges, and the condition id. This is the 0:57 frame. |
| 6 | A terminal with one eval line | `npm run eval` (no `SCORER`). The line includes `cases=248` and `false_approvals=0`. Do not wait on a download on camera. |
| 7 | `docs/sandbox-run.json` | Readable ids: `27224167CR8866647` CAPTURED, `9X732969JW2516540`, `00N1620869359422G` VOIDED. About 15 seconds. Do not open `.env`. |
| 8 | **Void every open hold**, then the stopped state | Every open authorization voided. |
| 9 | End card, plain text | "Public demo: TBD" and `npm install && npm run dev` → http://127.0.0.1:5173 |

Phone width (375px) is optional. The English desktop frames above are the ones the script names.

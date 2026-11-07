# Video script

Under three minutes. English. No music. No extra logos beyond what the screen already draws. Do not open `.env` or any key. Judges are not asked to watch past three minutes (PayPal AI Hackathon rules, read 2026-11-07), so the cut should end by 2:40.

Spoken lines only. Clicks happen under the line, not instead of it.

**0:00** Pay per truth. Fifty company records. One hold of fifty dollars. Each line lands pass or fail. The captured counter climbs, and so does the amount released. Thirteen fail. The line reads: Captured $37.00 of $50.00. $13.00 released.

**0:12** Scam my agent. An empty body. A field of the wrong type. A missing field. A year out of range. An instruction written into the name. A name that is not a company. A late reply. Send each one to the agent. None of them are captured. The amount stays at $0.00.

**0:32** This is the approval card. The seller line is a track record: how many purchases settled, what share matched the promised shape, and what share erred after payment. Those counts come from a frozen export. The line under the question says whether this seller is held once, or in parts.

**0:50** The condition was fixed before the hold. It asks for company records: a name, an ISO country code, an employee count, a founding year, and a source URL.

**1:05** Eval, 2026-11-07. 248 cases. Zero false approvals. The mock and Qwen3 printed the same bar: a bad delivery is not captured.

**1:20** This is the stop. Void every open hold. It voids open authorizations, and it will not open a new one.

**1:35** Try it in two minutes. The public URL is still TBD. Locally: `npm install`, `npm run dev`, then open 127.0.0.1 port 5173. The mock moves no money. The sandbox path uses PayPal's public test card, and only the sandbox host.

**2:00** The hold stays at PayPal. This page only decides whether to capture, void, or ask a person.

Stop by 2:20. Leave the end card up until 2:30 if the clicks ran long.

## Screens to record

| Order | What is on screen | Notes |
|---|---|---|
| 1 | Pay per truth, after **Run the 50 records**, with the final line `Captured $37.00 of $50.00. $13.00 released.` | This is the opening frame. Hold it until the 0:00 line finishes. The mock banner stays visible. |
| 2 | Scam my agent, after **Send to my agent** on a prepared fake | Outcome is `VOID` or `HUMAN`, never `CAPTURE`. Captured amount is `$0.00`. |
| 3 | Approval card after **Show the approval card** | The seller line and the one-line hold reason must both be readable. For a new seller the reason is `New seller: holding in 5 parts`. |
| 4 | The same card, scrolled to the condition | Shape, ranges, and the condition id. This is the 0:50 frame. |
| 5 | A terminal with one eval line | `npm run eval` (no `SCORER`). The line includes `false_approvals=0`. Font large enough to read. Do not wait on a download on camera. |
| 6 | **Void every open hold**, then the stopped state | Every open authorization voided. |
| 7 | End card, plain text | "Public demo: TBD" and `npm install && npm run dev` → http://127.0.0.1:5173 |

Optional, only if the cut is still under 2:30: **Activity**, with one order id, one authorization id, and the ledger hash. Skip it if the clock is tight.

Phone width (375px) is optional. The English desktop frames above are the ones the script names.

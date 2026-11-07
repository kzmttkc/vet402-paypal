# Video script

Under three minutes. English. No music. No extra logos beyond what the screen already draws. Do not open `.env` or any key. Judges are not asked to watch past three minutes (PayPal AI Hackathon rules, read 2026-11-07), so the cut should end by 2:40.

Spoken lines only. Clicks happen under the line, not instead of it.

**0:00** Same job, two deliveries. One click. The left side delivered the records. It reads CAPTURED. The right side delivered nothing. It reads VOIDED, and zero dollars.

**0:10** This is the approval card. The seller line is a track record: how many purchases settled, what share matched the promised shape, and what share erred after payment. Those counts come from a frozen export, not from a sentence typed into the card.

**0:30** The condition was fixed before the hold. It asks for company records: a name, an ISO country code, an employee count, a founding year, and a source URL. The mix of bad deliveries comes from 13,893 settled purchases, frozen on 2026-11-07. The export has no column for an empty body or a hidden instruction, so those cases are 12 each, not a measured share.

**0:55** Eval, 2026-11-07. 236 cases. Zero false approvals. Every correct delivery was captured. 10.6 percent went to a person. The mock and the downloaded MiniLM model printed the same line.

**1:15** This is the stop. Void every open hold. It voids open authorizations, and it will not open a new one.

**1:35** Try it in two minutes. The public URL is still TBD. Locally: `npm install`, `npm run dev`, then open 127.0.0.1 port 5173. The mock moves no money. The sandbox path uses PayPal's public test card, and only the sandbox host.

**2:05** The hold stays at PayPal. This page only decides whether to capture, void, or ask a person.

Stop by 2:20. Leave the end card up until 2:30 if the clicks ran long.

## Screens to record

| Order | What is on screen | Notes |
|---|---|---|
| 1 | http://127.0.0.1:5173, English, mock banner ("This session is on the mock rail. No money moves.") | `npm run dev`. Desktop width is enough. Do not film a terminal that has sourced `.env`. |
| 2 | After **Play the same job both ways**: left CAPTURED, right VOIDED, including "$0. Your agent didn't lose a cent." | Hold this until the 0:00 line finishes. This is the opening frame. |
| 3 | Approval card after **Show the approval card** | The seller line must be readable: "n paid purchases, x% matched the promised shape, y% errors after payment." Also the question "May I place a hold of $X until each delivery checks out?" |
| 4 | The same card, scrolled to the condition | Shape, ranges, and the condition id. This is the 0:30 frame. |
| 5 | A terminal with one eval line | `npm run eval` (no `EMBEDDER`). The line starts `eval cases=236 false_approvals=0`. Font large enough to read. The 2026-11-07 MiniLM run is already in EVAL.md. Do not wait on a download on camera. |
| 6 | **Void every open hold**, then the stopped state | Every open authorization voided. |
| 7 | End card, plain text | "Public demo: TBD" and `npm install && npm run dev` → http://127.0.0.1:5173 |

Optional, only if the cut is still under 2:30: **Activity**, with one order id, one authorization id, and the ledger hash. Skip it if the clock is tight.

Phone width (375px) is optional. The English desktop frames above are the ones the script names.

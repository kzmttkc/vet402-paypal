# Video script

Under three minutes. English. No music. No extra logos beyond what the screen already draws. Do not open `.env`, a key, or `docs/sandbox-run.json` on camera. The cut ends by 2:30.

Each row is one scene. Record the screen in the second column. Say the sentence in the third column, and put that same sentence on screen as the subtitle.

Replay Nov 7 plays the stored sandbox run. It does not call PayPal. The strip and the replay already show the ids, so leave the JSON file closed.

The static page does not draw PayPal's button. Record that one scene from the dev server. The URL and the steps are in the 1:56 row. `npm run dev` does not open a key file.

| Time | Screen to record | English subtitle |
|---|---|---|
| 0:00–0:14 | Hero. Headline `Pay only for what arrived.` The strip reads `Sandbox · authorized $50.00 · captured $12.50 · order 68V137364A632645V` and `13,893 settled · 1,826 broken`. | An agent that pays for data gets a broken answer about one time in eight. 1,826 of 13,893 settled purchases, frozen on 2026-11-07. PayPal holds the budget. Capture only what arrived. |
| 0:14–0:26 | Press **Play**. Hold on `Captured $37.00 of $50.00. $13.00 released.` | This page holds $50 and pays only for what passed. Captured $37.00 of $50.00. $13.00 released. The mock moves no money. |
| 0:26–0:40 | **Replay Nov 7**. The note says `Recorded replay of the sandbox run. This page does not call PayPal.` Hold on gate 1: `Gate 1. Authorize $50.00, then capture $12.50`, order `68V137364A632645V`, authorization `27224167CR8866647`, capture `9X732969JW2516540`. | Replay of the sandbox run from November 7. No new PayPal call. Gate 1 captured $12.50 of a $50 hold. |
| 0:40–0:54 | The same replay, gate 2. Readable: `Gate 2. The buyer is away. A saved Visa captures $25.00`, payment token `7p2918019c535510e`, order `2VF918768H442974L`, authorization `4P108854H39466338`, capture `6FC1708084437483W`. The run window is `2026-11-07T03:42:54.620Z` to `2026-11-07T03:43:41.883Z`. | A saved Visa captured $25.00 while the buyer was away. Only the start and the finish were stored. |
| 0:54–1:08 | **Figure 1.** Heading `What the frozen export already paid for`. Readable counts: `736` paid 4xx, `121` paid 5xx, `728` on time then the wrong shape, `241` later than 15 seconds. | Those 1,826 are a paid 4xx, a paid 5xx, a shape miss, or a late 2xx. |
| 1:08–1:20 | **Pay per truth**. Heading `Pay per truth`. The first passing record reads `CAPTURED`. Hold on `Captured $37.00 of $50.00. $13.00 released.` | Pay per truth. One hold, then capture only the records that passed. Captured $37.00 of $50.00. $13.00 released. |
| 1:20–1:34 | **Scam my agent**, after **Send to my agent** on `Empty response`, `Wrong type`, `Missing field`, `Out of range`, `Instruction in a field`, and `Late`. | Empty response, wrong type, missing field, out of range, an instruction in a field, or late. None of these are captured. The amount stays at $0.00. |
| 1:34–1:46 | The same panel, **Not a company**. Hold on `Nothing was captured. Judged by a rule. This name is on a fixed list, so no model was asked.` Amount line `Captured $0.00`. | This name is on a fixed list. Judged by a rule. No model is asked. Captured stays $0.00. |
| 1:46–1:56 | **Show the plan**, seller line visible, level set to Supervised. The reason reads `Established seller: one hold for the whole job`. | The seller line is counted from the frozen export. An established seller is one hold for the whole job. |
| 1:56–2:14 | Dev server only, at http://127.0.0.1:5173 . Start it with `npm run dev` after `PAYPAL_ENV=sandbox` and `PAYPAL_CLIENT_ID` are already in the process environment. The process also needs `PAYPAL_CLIENT_SECRET` or it will not boot. Do not print the values. `scripts/dev.ts` only forwards that environment. It does not read a key file. The `--env-file=.env` switch already on `npm run sandbox:run`, `npm run demo:sandbox`, and `npm run test:sandbox` does not serve this screen. Leave the seller on Established and the level on Supervised. Press **Show the plan**, then **Continue to approval**. Hold on `Approve the hold` and PayPal's own `paypal-button` (JavaScript SDK v6). The line `PAYPAL_CLIENT_ID is not set` must not be the approval on screen. | Supervised approval is PayPal's own button. |
| 2:14–2:30 | End card. Public demo: https://kzmttkc.github.io/vet402-paypal/ and `npm install && npm run dev` → http://127.0.0.1:5173 | Open https://kzmttkc.github.io/vet402-paypal/ and press Play. The mock moves no money. |

Phone width (375px) is optional. The desktop frames above are the ones to record.

If the model is mentioned, use this and not the earlier 49 of 60. On 60 names that were not used to build the list, Qwen3 alone was right on 49. A capture now needs that yes and a second check. Both checks captured 14 of 30 companies. None of the 30 that are not companies were captured. 25 of the 60 went to a person.

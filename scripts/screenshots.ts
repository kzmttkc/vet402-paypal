/**
 * Saves the Day 2 screens. Expects `npm run dev` already listening on port 5173.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.SCREEN_URL ?? "http://127.0.0.1:5173";
const out = "docs/screens";

async function waitUp(): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base);
      if (res.ok) return;
    } catch {
      /* server still starting */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${base} did not open. Start it with npm run dev.`);
}

await waitUp();
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.getByTestId("demo-play").click();
await page.getByTestId("demo-left-status").waitFor();
const left = (await page.getByTestId("demo-left-status").innerText()).trim();
const right = (await page.getByTestId("demo-right-status").innerText()).trim();
const lost = (await page.getByTestId("demo-right-summary").innerText()).trim();
if (left !== "CAPTURED" || right !== "VOIDED" || !lost.includes("didn't lose a cent")) {
  throw new Error(`demo showed ${left} / ${right} / ${lost}`);
}
await page.screenshot({ path: `${out}/demo-mobile.png`, animations: "disabled" });

await page.setViewportSize({ width: 1100, height: 900 });
await page.getByTestId("demo-pair").scrollIntoViewIfNeeded();
const pair = await page.getByTestId("demo-pair").boundingBox();
if (!pair) throw new Error("demo pair has no box");
await page.screenshot({
  path: `${out}/demo-captured-voided.png`,
  clip: { x: 0, y: 0, width: 1100, height: Math.min(900, Math.ceil(pair.y + pair.height + 28)) },
  animations: "disabled",
});

await page.getByRole("button", { name: "Show the approval card" }).click();
await page.getByTestId("approval-seller-line").waitFor();
const seller = (await page.getByTestId("approval-seller-line").innerText()).trim();
const condition = (await page.getByTestId("approval-condition-id").innerText()).trim();
if (!/^\d+ paid purchases, \d+\.\d% matched the promised shape, \d+\.\d% errors after payment$/.test(seller)) {
  throw new Error(`seller line: ${seller}`);
}
if (!/^cond_[0-9a-f]{64}$/.test(condition)) throw new Error(`condition id: ${condition}`);
await page.addStyleTag({ content: ".stopbar{display:none !important}" });
await page.getByRole("button", { name: "Place the hold" }).waitFor();
await page.getByTestId("approval-card").screenshot({ path: `${out}/approval-card.png`, animations: "disabled" });
await page.getByRole("button", { name: "Capture" }).first().waitFor();
await page.getByTestId("review-grid").scrollIntoViewIfNeeded();
await page.getByTestId("review-grid").screenshot({ path: `${out}/review-queue.png`, animations: "disabled" });

await browser.close();
console.log(`${out}/demo-mobile.png`);
console.log(`${out}/demo-captured-voided.png`);
console.log(`${out}/approval-card.png`);
console.log(`${out}/review-queue.png`);

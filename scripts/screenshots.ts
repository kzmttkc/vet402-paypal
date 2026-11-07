/**
 * Saves the live screen. Expects `npm run dev` already listening on port 5173.
 * Uses Playwright's headless Chromium. It does not launch the Google Chrome app.
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

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const started = Date.now();
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.getByTestId("pay-per-truth-play").click();
await page.getByTestId("first-captured").waitFor();
const word = (await page.getByTestId("first-captured").innerText()).trim();
if (word !== "CAPTURED") throw new Error(`first status was ${word}`);
console.log(`first CAPTURED ${((Date.now() - started) / 1000).toFixed(2)}s`);
await page.screenshot({ path: `${out}/pay-per-truth.png`, animations: "disabled" });

await page.getByRole("button", { name: "Show the plan" }).click();
await page.getByTestId("approval-seller-line").waitFor();
const seller = (await page.getByTestId("approval-seller-line").innerText()).trim();
if (!/^\d+ paid purchases, \d+\.\d% matched the promised shape, \d+\.\d% errors after payment$/.test(seller)) {
  throw new Error(`seller line: ${seller}`);
}
await page.getByRole("button", { name: "Continue to approval" }).click();
await page.getByTestId("mock-approval").waitFor();
await page.getByTestId("approval-card").screenshot({ path: `${out}/approval-card.png`, animations: "disabled" });

await page.getByRole("tab", { name: "Scam my agent" }).click();
await page.getByTestId("scam-bench").screenshot({ path: `${out}/scam-my-agent.png`, animations: "disabled" });

await browser.close();
console.log(`${out}/pay-per-truth.png`);
console.log(`${out}/approval-card.png`);
console.log(`${out}/scam-my-agent.png`);

/**
 * Screenshots of the static demo, and the time from arrival to the first CAPTURED.
 * Playwright's own headless Chromium opens dist-static/index.html as a file.
 * No Google Chrome, and no dev server.
 * Build first with `npm run build:static`.
 */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";

const out = "docs/screens";
const index = resolve("dist-static/index.html");
const pageUrl = pathToFileURL(index).href;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function played(page: Page): Promise<void> {
  await page.getByTestId("pay-per-truth-play").click();
  await page.getByTestId("first-captured").waitFor();
  const word = (await page.getByTestId("first-captured").innerText()).trim();
  if (word !== "CAPTURED") throw new Error(`first status was ${word}`);
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
});

try {
  await mkdir(out, { recursive: true });
  const problems: string[] = [];

  const timed = await browser.newPage({ viewport: { width: 375, height: 812 } });
  timed.on("pageerror", (error) => problems.push(error.message));
  const started = Date.now();
  await timed.goto(pageUrl);
  await timed.getByTestId("sim-banner").waitFor();
  const banner = (await timed.getByTestId("sim-banner").innerText()).trim();
  if (banner !== "Simulated. No money moves.") throw new Error(`banner: ${banner}`);
  const heading = (await timed.getByTestId("page-heading").innerText()).trim();
  if (heading !== "Pay per truth") throw new Error(`default heading: ${heading}`);
  if ((await timed.locator("main").getAttribute("data-lang")) !== "en") throw new Error("default lang is not en");
  await played(timed);
  const seconds = (Date.now() - started) / 1000;
  console.log(`first CAPTURED ${seconds.toFixed(2)}s`);
  if (seconds > 10) throw new Error(`first CAPTURED took ${seconds.toFixed(2)}s`);
  await timed.screenshot({ path: `${out}/static-375.png`, animations: "disabled" });
  await timed.getByRole("button", { name: "Show the plan" }).click();
  await timed.getByTestId("approval-card").waitFor();
  await timed.getByRole("button", { name: "Continue to approval" }).click();
  const mock = (await timed.getByTestId("mock-approval").innerText()).trim();
  if (!mock.includes("PAYPAL_CLIENT_ID is not set")) throw new Error(`mock sheet: ${mock}`);
  const wide = await overflow(timed);
  if (wide > 1) throw new Error(`375px page is ${wide}px too wide`);
  await timed.screenshot({ path: `${out}/static-en.png`, animations: "disabled" });

  const dark = await browser.newPage({ viewport: { width: 375, height: 812 }, colorScheme: "dark" });
  dark.on("pageerror", (error) => problems.push(error.message));
  await dark.goto(pageUrl);
  await dark.getByTestId("pay-per-truth-play").waitFor();
  const paper = await dark.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (paper !== "rgb(22, 19, 15)") throw new Error(`dark paper: ${paper}`);
  await dark.screenshot({ path: `${out}/static-dark.png`, animations: "disabled" });

  const keys = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  keys.on("pageerror", (error) => problems.push(error.message));
  await keys.goto(pageUrl);
  await keys.getByTestId("pay-per-truth-play").waitFor();
  for (let i = 0; i < 6; i++) {
    await keys.keyboard.press("Tab");
    const name = await keys.evaluate(() => document.activeElement?.getAttribute("data-testid"));
    if (name === "pay-per-truth-play") break;
  }
  const focused = await keys.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  if (focused !== "pay-per-truth-play") throw new Error(`keyboard focus landed on ${focused}`);
  await keys.screenshot({ path: `${out}/static-keyboard.png`, animations: "disabled" });

  const japanese = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await japanese.goto(`${pageUrl}?lang=ja`);
  await japanese.getByTestId("page-heading").waitFor();
  const jaHeading = (await japanese.getByTestId("page-heading").innerText()).trim();
  if (jaHeading !== "正しかった分だけ払う") throw new Error(`ja heading: ${jaHeading}`);
  if ((await japanese.getByTestId("sim-banner").innerText()).trim() !== "模擬・お金は動かない") throw new Error("ja banner changed");
  await japanese.screenshot({ path: `${out}/static-ja.png`, animations: "disabled" });
  const phoneJa = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await phoneJa.goto(`${pageUrl}?lang=ja`);
  await phoneJa.getByTestId("sim-banner").waitFor();
  const wideJa = await overflow(phoneJa);
  if (wideJa > 1) throw new Error(`375px Japanese page is ${wideJa}px too wide`);

  if (problems.length) throw new Error(problems.join("\n"));
  await timed.close();
  await dark.close();
  await keys.close();
  await japanese.close();
  await phoneJa.close();
} finally {
  await browser.close();
}

console.log(`${out}/static-375.png`);
console.log(`${out}/static-dark.png`);
console.log(`${out}/static-keyboard.png`);
console.log(`${out}/static-en.png`);
console.log(`${out}/static-ja.png`);

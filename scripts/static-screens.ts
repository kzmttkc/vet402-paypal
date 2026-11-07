/**
 * Screenshots of the static demo. No dev server and no Google Chrome:
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
  await page.getByTestId("demo-play").click();
  await page.getByTestId("demo-left-status").waitFor();
  const left = (await page.getByTestId("demo-left-status").innerText()).trim();
  const right = (await page.getByTestId("demo-right-status").innerText()).trim();
  if (left !== "CAPTURED" || right !== "VOIDED") throw new Error(`demo showed ${left} / ${right}`);
}

const browser = await chromium.launch({ headless: true });

try {
  await mkdir(out, { recursive: true });
  const desktop = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const problems: string[] = [];
  desktop.on("pageerror", (error) => problems.push(error.message));
  await desktop.goto(pageUrl);
  await desktop.getByTestId("sim-banner").waitFor();
  const banner = (await desktop.getByTestId("sim-banner").innerText()).trim();
  if (banner !== "Simulated. No money moves.") throw new Error(`banner: ${banner}`);
  const heading = (await desktop.getByTestId("page-heading").innerText()).trim();
  if (heading !== "Place a hold. Pay only for what arrived.") throw new Error(`default heading: ${heading}`);
  if ((await desktop.locator("main").getAttribute("data-lang")) !== "en") throw new Error("default lang is not en");
  await desktop.screenshot({ path: `${out}/static-en.png`, animations: "disabled" });

  await played(desktop);
  const lost = (await desktop.getByTestId("demo-right-summary").innerText()).trim();
  if (lost !== "$0. Your agent didn't lose a cent.") throw new Error(`void summary: ${lost}`);
  await desktop.getByTestId("demo-pair").scrollIntoViewIfNeeded();
  const pair = await desktop.getByTestId("demo-pair").boundingBox();
  if (!pair) throw new Error("demo pair has no box");
  await desktop.screenshot({
    path: `${out}/static-demo.png`,
    clip: { x: 0, y: 0, width: 1100, height: Math.min(900, Math.ceil(pair.y + pair.height + 24)) },
    animations: "disabled",
  });
  await desktop.getByRole("button", { name: "Show the approval card" }).click();
  await desktop.getByTestId("approval-card").waitFor();
  await desktop.getByRole("button", { name: "Place the hold" }).click();
  await desktop.getByTestId("stop-button").click();
  if ((await desktop.getByTestId("stop-button").innerText()).trim() !== "Stopped") throw new Error("stop did not engage");

  const japanese = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  await japanese.goto(`${pageUrl}?lang=ja`);
  await japanese.getByTestId("page-heading").waitFor();
  const jaHeading = (await japanese.getByTestId("page-heading").innerText()).trim();
  if (jaHeading !== "与信する。届いた分だけ支払う。") throw new Error(`ja heading: ${jaHeading}`);
  if ((await japanese.getByTestId("sim-banner").innerText()).trim() !== "模擬・お金は動かない") throw new Error("ja banner changed");
  await japanese.screenshot({ path: `${out}/static-ja.png`, animations: "disabled" });

  const phone = await browser.newPage({ viewport: { width: 375, height: 1200 } });
  await phone.goto(`${pageUrl}?lang=ja`);
  await phone.getByTestId("sim-banner").waitFor();
  await played(phone);
  const jaLost = (await phone.getByTestId("demo-right-summary").innerText()).trim();
  if (!jaLost.startsWith("$0")) throw new Error(`ja void amount: ${jaLost}`);
  await phone.screenshot({ path: `${out}/static-375.png`, animations: "disabled" });
  await phone.getByRole("button", { name: "承認カードを表示" }).click();
  await phone.getByTestId("approval-card").waitFor();
  const wide = await overflow(phone);
  if (wide > 1) throw new Error(`375px page is ${wide}px too wide`);

  const phoneEn = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await phoneEn.goto(pageUrl);
  await played(phoneEn);
  await phoneEn.getByRole("button", { name: "Show the approval card" }).click();
  await phoneEn.getByTestId("approval-card").waitFor();
  const wideEn = await overflow(phoneEn);
  if (wideEn > 1) throw new Error(`375px English page is ${wideEn}px too wide`);
  if (problems.length) throw new Error(problems.join("\n"));
  await desktop.close();
  await japanese.close();
  await phone.close();
  await phoneEn.close();
} finally {
  await browser.close();
}

console.log(`${out}/static-en.png`);
console.log(`${out}/static-demo.png`);
console.log(`${out}/static-ja.png`);
console.log(`${out}/static-375.png`);

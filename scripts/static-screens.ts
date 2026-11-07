/**
 * Screenshots of the static demo, and the time from arrival to the first CAPTURED.
 * Playwright's own headless Chromium opens dist-static/index.html as a file.
 * No Google Chrome, and no dev server.
 * Build first with `npm run build:static`.
 */
import { readdirSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Page } from "playwright";

/** Playwright's own headless shell. Not Google Chrome, and not the full Chromium.app. */
function headlessShell(): string {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM;
  if (fromEnv) return fromEnv;
  const root = join(homedir(), "Library/Caches/ms-playwright");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (name === "chrome-headless-shell" && statSync(path).isFile()) found.push(path);
      else if (statSync(path).isDirectory() && name !== "node_modules") walk(path);
    }
  };
  walk(root);
  const shell = found.find((path) => path.includes("chromium_headless_shell"));
  if (!shell) throw new Error("Playwright's chromium_headless_shell is not installed");
  return shell;
}

const out = "docs/screens";
const index = resolve("dist-static/index.html");
const pageUrl = pathToFileURL(index).href;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The stop control follows the writing. It must not sit on top of a line. */
async function coveredLine(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const button = document.querySelector("[data-testid=stop-button]");
    if (!button) return "missing stop button";
    const box = button.getBoundingClientRect();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (text && node.parentElement !== button) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width < 1 || rect.height < 1) continue;
          const clear = rect.bottom <= box.top + 0.5 || rect.top >= box.bottom - 0.5 || rect.right <= box.left || rect.left >= box.right;
          if (!clear) return text.slice(0, 80);
        }
      }
      node = walker.nextNode();
    }
    return null;
  });
}

async function scoreSettled(page: Page): Promise<string> {
  const banner = page.getByTestId("sim-banner");
  await banner.waitFor();
  await page.waitForFunction(() => {
    const phase = document.querySelector("[data-testid=sim-banner]")?.getAttribute("data-score-phase") ?? "";
    return phase === "ready" || phase === "failed";
  }, undefined, { timeout: 120_000 });
  return (await banner.innerText()).trim();
}

/** Click Play as soon as the button is there. The model load started at page open. */
async function played(page: Page): Promise<"captured" | "refused"> {
  const play = page.getByTestId("pay-per-truth-play");
  await play.waitFor();
  await play.click();
  let loadingText = "";
  const loadingWatch = page
    .getByTestId("model-loading")
    .waitFor({ state: "visible", timeout: 120_000 })
    .then(async () => {
      loadingText = (await page.getByTestId("model-loading").innerText()).trim();
    })
    .catch(() => undefined);
  const banner = await scoreSettled(page);
  await Promise.race([loadingWatch, new Promise((resolve) => setTimeout(resolve, 200))]);
  if (loadingText && !loadingText.startsWith("AI model loading")) throw new Error(`loading line: ${loadingText}`);
  console.log(loadingText ? `play waited: ${loadingText}` : "play did not wait: model already ready");
  const stamp = page.getByTestId("first-captured");
  const line = page.getByTestId("pay-per-truth-line");
  await Promise.race([
    stamp.waitFor({ state: "visible", timeout: 30_000 }).catch(() => undefined),
    line.waitFor({ state: "visible", timeout: 30_000 }),
  ]);
  if (await stamp.count()) {
    const word = (await stamp.innerText()).trim();
    if (word !== "CAPTURED") throw new Error(`first status was ${word}`);
    return "captured";
  }
  if (!banner.includes("will not capture") && !banner.includes("確定しません")) {
    throw new Error(`no CAPTURED, and the banner did not say the model failed: ${banner}`);
  }
  const shown = (await line.innerText()).trim();
  if (shown.includes("$37.00")) throw new Error(`failed model still showed the capture line: ${shown}`);
  return "refused";
}

const shell = headlessShell();
console.log(`browser ${shell}`);
const browser = await chromium.launch({ headless: true, executablePath: shell });

try {
  await mkdir(out, { recursive: true });
  const problems: string[] = [];

  const stage = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  stage.on("pageerror", (error) => problems.push(error.message));
  await stage.goto(pageUrl);
  await stage.getByTestId("hero").waitFor();
  const ticker = (await stage.getByTestId("fact-ticker").innerText()).replace(/\s+/g, " ");
  if (!ticker.includes("order 68V137364A632645V") || !ticker.includes("13,893 settled") || !ticker.includes("1,826 broken")) {
    throw new Error(`ticker: ${ticker}`);
  }
  if (ticker.includes("2ES4")) throw new Error("ticker quoted the $20 order");
  await stage.screenshot({ path: `${out}/hero.png`, animations: "disabled" });
  await stage.getByTestId("replay-nov7-button").click();
  await stage.getByText("Run finished").waitFor({ timeout: 12_000 });
  const replayNote = (await stage.getByTestId("replay-note").innerText()).trim();
  if (replayNote !== "Recorded replay of the sandbox run. This page does not call PayPal.") throw new Error(`replay note: ${replayNote}`);
  await stage.getByTestId("replay-nov7").screenshot({ path: `${out}/replay.png`, animations: "disabled" });
  await stage.getByTestId("failure-evidence").screenshot({ path: `${out}/evidence.png`, animations: "disabled" });
  const stageWide = await overflow(stage);
  if (stageWide > 1) throw new Error(`1280px page is ${stageWide}px too wide`);

  const timed = await browser.newPage({ viewport: { width: 375, height: 812 } });
  timed.on("pageerror", (error) => problems.push(error.message));
  const started = Date.now();
  await timed.goto(pageUrl);
  await timed.getByTestId("sim-banner").waitFor();
  const banner = (await timed.getByTestId("sim-banner").innerText()).trim();
  if (banner !== "Simulated. No money moves. Capture needs a recorded yes and a company-exemplar match.") {
    throw new Error(`banner: ${banner}`);
  }
  if (await timed.getByTestId("score-model").count()) throw new Error("a second notice is still on the page");
  const heading = (await timed.getByTestId("page-heading").innerText()).replace(/\s+/g, " ").trim();
  if (heading !== "Pay only for what arrived.") throw new Error(`default heading: ${heading}`);
  if ((await timed.locator("main").getAttribute("data-lang")) !== "en") throw new Error("default lang is not en");
  const outcome = await played(timed);
  const seconds = (Date.now() - started) / 1000;
  console.log(outcome === "captured" ? `first CAPTURED ${seconds.toFixed(2)}s` : `model failed, no CAPTURED, ${seconds.toFixed(2)}s`);
  await timed.screenshot({ path: `${out}/static-375.png`, animations: "disabled" });
  await timed.getByRole("button", { name: "Show the plan" }).click();
  await timed.getByTestId("approval-card").waitFor();
  await timed.getByRole("button", { name: "Continue to approval" }).click();
  const mock = (await timed.getByTestId("mock-approval").innerText()).trim();
  if (!mock.includes("PAYPAL_CLIENT_ID is not set")) throw new Error(`mock sheet: ${mock}`);
  const wide = await overflow(timed);
  if (wide > 1) throw new Error(`375px page is ${wide}px too wide`);
  const covered = await coveredLine(timed);
  if (covered) throw new Error(`stop control covers: ${covered}`);
  await timed.getByTestId("stop-button").scrollIntoViewIfNeeded();
  const coveredAtEnd = await coveredLine(timed);
  if (coveredAtEnd) throw new Error(`stop control covers the end: ${coveredAtEnd}`);
  await timed.screenshot({ path: `${out}/static-en.png`, animations: "disabled" });

  const keys = await browser.newPage({ viewport: { width: 1100, height: 800 }, colorScheme: "light" });
  keys.on("pageerror", (error) => problems.push(error.message));
  await keys.goto(pageUrl);
  await scoreSettled(keys);
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
  const jaHeading = (await japanese.getByTestId("page-heading").innerText()).replace(/\s+/g, " ").trim();
  if (jaHeading !== "届いた分だけ払う。") throw new Error(`ja heading: ${jaHeading}`);
  if (
    (await japanese.getByTestId("sim-banner").innerText()).trim() !==
    "模擬です。お金は動きません。確定には、記録された yes と会社の見本との一致が要ります。"
  ) {
    throw new Error("ja banner changed");
  }
  await japanese.screenshot({ path: `${out}/static-ja.png`, animations: "disabled" });
  const phoneJa = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await phoneJa.goto(`${pageUrl}?lang=ja`);
  await phoneJa.getByTestId("sim-banner").waitFor();
  const wideJa = await overflow(phoneJa);
  if (wideJa > 1) throw new Error(`375px Japanese page is ${wideJa}px too wide`);

  if (problems.length) throw new Error(problems.join("\n"));
  await stage.close();
  await timed.close();
  await keys.close();
  await japanese.close();
  await phoneJa.close();
} finally {
  await browser.close();
}

console.log(`${out}/hero.png`);
console.log(`${out}/replay.png`);
console.log(`${out}/evidence.png`);
console.log(`${out}/static-375.png`);
console.log(`${out}/static-keyboard.png`);
console.log(`${out}/static-en.png`);
console.log(`${out}/static-ja.png`);

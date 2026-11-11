/**
 * At 1280x900, the five person-list columns fit, and the third reason is whole.
 * Opens the static build. Build first with `npm run build:static`.
 */
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

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

const wanted = ["Decision", "Reason", "Records", "Waiting", "Hold"];
const reasonText = "The score was not a usable number, so a person decides.";
const index = resolve("dist-static/index.html");

const browser = await chromium.launch({ headless: true, executablePath: headlessShell() });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  await page.goto(pathToFileURL(index).href);
  await page.getByTestId("review-grid").waitFor();
  await page.getByTestId("judged-run").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("columnheader", { name: "Decision" }).scrollIntoViewIfNeeded();

  const seen = await page.evaluate(() => {
    const grid = document.querySelector("[data-testid=review-grid]");
    if (!grid) return null;
    const view = grid.getBoundingClientRect();
    const headers = [...grid.querySelectorAll(".ag-header-cell")].map((cell) => {
      const box = cell.getBoundingClientRect();
      const label = cell.querySelector(".ag-header-cell-text");
      const name = label?.textContent?.trim() ?? "";
      return {
        name,
        inView: box.left >= view.left - 1 && box.right <= view.right + 1 && box.top >= 0 && box.bottom <= window.innerHeight,
        headerScroll: label ? label.scrollWidth : 0,
        headerClient: label ? label.clientWidth : 0,
      };
    });
    const row = grid.querySelector('.ag-center-cols-container .ag-row[row-index="2"]');
    const value = row?.querySelector('.ag-cell[col-id="reason"] .ag-cell-value');
    return {
      gridClient: Math.round(view.width),
      headers,
      reason: value?.textContent?.trim() ?? "",
      scrollWidth: value ? value.scrollWidth : -1,
      clientWidth: value ? value.clientWidth : -1,
      band: document.querySelector("[data-testid=judged-run]")?.textContent?.trim() ?? "",
    };
  });

  if (!seen) throw new Error("review grid missing");
  const names = wanted.map((name) => {
    const header = seen.headers.find((item) => item.name === name);
    return header ? `${name}:${header.inView ? "in" : "out"}` : `${name}:missing`;
  });
  console.log(`columns ${names.join(" ")} grid=${seen.gridClient}`);
  console.log(`reason ${seen.reason}`);
  console.log(`scrollWidth=${seen.scrollWidth} clientWidth=${seen.clientWidth}`);
  console.log(`band ${seen.band}`);

  const ja = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
  await ja.goto(`${pathToFileURL(index).href}?lang=ja`);
  await ja.getByTestId("judged-run").waitFor();
  console.log(`ja ${(await ja.getByTestId("judged-run").innerText()).trim()}`);

  const headersFit = wanted.every((name) => seen.headers.some((item) => item.name === name && item.inView && item.headerScroll <= item.headerClient));
  const reasonFits = seen.reason === reasonText && seen.scrollWidth <= seen.clientWidth && seen.clientWidth > 0;
  if (!headersFit || !reasonFits) process.exitCode = 1;
} finally {
  await browser.close();
}

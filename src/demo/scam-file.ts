import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ScamWin } from "./scam.js";

const FILE = "eval/scam-wins.json";

/** Append one captured scam in the shape `eval/cases.ts` already uses. */
export function rememberScamWin(win: ScamWin): void {
  const current: unknown = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
  if (!Array.isArray(current)) throw new Error("scam win log is not a list");
  current.push(win);
  writeFileSync(FILE, `${JSON.stringify(current, null, 2)}\n`);
}

/**
 * Combine recorded yes/no answers with the exemplar check.
 * The default file is docs/held-out-qwen3-2026-11-07.json.
 * `--answers <path>` reads another file with the same rows, such as Claude's.
 * This file does not choose the threshold. The exemplar check uses the cached MiniLM weights.
 *
 *   env -u ANTHROPIC_API_KEY -u HF_TOKEN -u HF_ACCESS_TOKEN -u HUGGING_FACE_HUB_TOKEN npx tsx eval/held-out-agree.ts
 *   env -u ANTHROPIC_API_KEY -u HF_TOKEN -u HF_ACCESS_TOKEN -u HUGGING_FACE_HUB_TOKEN npx tsx eval/held-out-agree.ts --answers docs/held-out-qwen3-2026-11-07.json
 *
 * Both yes → capture. One yes → human. Both no → void. Anything else → human.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { HELD_OUT_NAMES } from "./held-out-names.js";
import { CALIBRATION_COMPANIES, CALIBRATION_OTHERS, COMPANY_EXEMPLARS, embeddingCompanyShape } from "../src/verify/company-shape.js";

interface SavedRow {
  text: string;
  truth: "company" | "not_company";
  answer: "yes" | "no" | null;
}

function payment(answer: SavedRow["answer"], shape: boolean): "capture" | "void" | "human" {
  if (answer === "yes" && shape) return "capture";
  if (answer === "no" && !shape) return "void";
  return "human";
}

const blocked = new Set<string>([...COMPANY_EXEMPLARS, ...CALIBRATION_COMPANIES, ...CALIBRATION_OTHERS]);
for (const row of HELD_OUT_NAMES) {
  if (blocked.has(row.text)) throw new Error(`${row.text} was used to choose the exemplar check`);
}

function answersUrl(): URL {
  const flag = process.argv.indexOf("--answers");
  if (flag === -1) return new URL("../docs/held-out-qwen3-2026-11-07.json", import.meta.url);
  const given = process.argv[flag + 1];
  if (given === undefined || given.startsWith("-")) throw new Error("--answers needs a path");
  return pathToFileURL(resolve(given));
}

const saved = JSON.parse(readFileSync(answersUrl(), "utf8")) as { rows: SavedRow[] };
const byText = new Map(saved.rows.map((row) => [row.text, row]));

delete process.env.HF_TOKEN;
delete process.env.HF_ACCESS_TOKEN;
delete process.env.HUGGING_FACE_HUB_TOKEN;
delete process.env.ANTHROPIC_API_KEY;

const rows: {
  text: string;
  truth: "company" | "not_company";
  answer: SavedRow["answer"];
  shape: boolean;
  payment: "capture" | "void" | "human";
}[] = [];

for (const row of HELD_OUT_NAMES) {
  const prior = byText.get(row.text);
  if (!prior || prior.truth !== row.truth) throw new Error(`recorded answer missing for ${row.text}`);
  const shape = await embeddingCompanyShape(row.text);
  const outcome = payment(prior.answer, shape);
  rows.push({ text: row.text, truth: row.truth, answer: prior.answer, shape, payment: outcome });
  console.error(`${row.text}\t${prior.answer ?? "unusable"}\t${shape ? "near" : "far"}\t${outcome}`);
}

const companies = rows.filter((row) => row.truth === "company");
const others = rows.filter((row) => row.truth === "not_company");
const falseCaptures = others.filter((row) => row.payment === "capture");
console.log(JSON.stringify({
  n: rows.length,
  falseCaptures: falseCaptures.length,
  falseCaptureNames: falseCaptures.map((row) => row.text),
  companyCaptures: companies.filter((row) => row.payment === "capture").length,
  companies: companies.length,
  human: rows.filter((row) => row.payment === "human").length,
  void: rows.filter((row) => row.payment === "void").length,
  capture: rows.filter((row) => row.payment === "capture").length,
  companyHuman: companies.filter((row) => row.payment === "human").length,
  companyVoid: companies.filter((row) => row.payment === "void").length,
  otherHuman: others.filter((row) => row.payment === "human").length,
  otherVoid: others.filter((row) => row.payment === "void").length,
}, null, 2));

/**
 * Ask Qwen3 the company question on HELD_OUT_NAMES and print Qwen3's answer.
 * Does not download a paid API. Weights stay in .cache/transformers.
 *
 *   env -u ANTHROPIC_API_KEY -u HF_TOKEN -u HF_ACCESS_TOKEN -u HUGGING_FACE_HUB_TOKEN npx tsx eval/held-out.ts
 *
 * Prints what Qwen3 alone answered. A yes here is not a capture.
 * The judge also requires the exemplar check. That result is eval/held-out-agree.ts.
 */
import { OFF_TOPIC_NAMES } from "./cases.js";
import { HELD_OUT_NAMES } from "./held-out-names.js";
import { companyPrompt, readYesNo, startLanguageModel } from "../src/verify/language.js";

const GENERATOR_NAMES = ["Kizuna Logistics", "Northwind Foods", "Hanami Robotics", "Blue Ridge Energy", "Sakura Bio", "Atlas Freight", "Mizu Water Co.", "Orion Analytics", "Pine & Oak Ltd.", "Kaito Motors", "Lumen Health", "Tora Steel"];

function assertFresh(): void {
  const blocked = new Set<string>([...OFF_TOPIC_NAMES, ...GENERATOR_NAMES]);
  for (const row of HELD_OUT_NAMES) {
    if (blocked.has(row.text)) throw new Error(`${row.text} was used to build the eval list`);
  }
  const companies = HELD_OUT_NAMES.filter((row) => row.truth === "company");
  const others = HELD_OUT_NAMES.filter((row) => row.truth === "not_company");
  if (companies.length !== others.length) throw new Error("company and not-company counts differ");
}

assertFresh();

delete process.env.HF_TOKEN;
delete process.env.HF_ACCESS_TOKEN;
delete process.env.HUGGING_FACE_HUB_TOKEN;
delete process.env.ANTHROPIC_API_KEY;

const ask = await startLanguageModel();
const rows: {
  text: string;
  truth: string;
  leftOutOfList: boolean;
  raw: string;
  answer: "yes" | "no" | null;
  payment: "capture" | "void" | "human";
  correct: boolean;
}[] = [];

for (const row of HELD_OUT_NAMES) {
  const started = Date.now();
  const raw = await ask(companyPrompt(row.text));
  const answer = readYesNo(raw);
  const payment = answer === "yes" ? "capture" : answer === "no" ? "void" : "human";
  const correct = (row.truth === "company" && answer === "yes") || (row.truth === "not_company" && answer === "no");
  rows.push({ text: row.text, truth: row.truth, leftOutOfList: row.leftOutOfList === true, raw, answer, payment, correct });
  console.error(`${row.text}\t${answer ?? "unusable"}\t${payment}\t${Date.now() - started}ms`);
}

const correct = rows.filter((row) => row.correct).length;
const wrong = rows.filter((row) => !row.correct);
console.log(JSON.stringify({
  n: rows.length,
  companies: rows.filter((row) => row.truth === "company").length,
  notCompanies: rows.filter((row) => row.truth === "not_company").length,
  correct,
  accuracy: correct / rows.length,
  capture: rows.filter((row) => row.payment === "capture").length,
  void: rows.filter((row) => row.payment === "void").length,
  human: rows.filter((row) => row.payment === "human").length,
  wrong,
  rows,
}, null, 2));

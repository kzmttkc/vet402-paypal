/**
 * Ask Claude the company question on HELD_OUT_NAMES and print the same JSON as eval/held-out.ts.
 * The call uses the Messages API and the same headers as callClaude in src/verify/score.ts.
 * ANTHROPIC_API_KEY is sent only as a header. It is never written into a log or an error.
 *
 *   npm run eval:claude
 */
import { pathToFileURL } from "node:url";
import { HELD_OUT_NAMES, type HeldOutName } from "./held-out-names.js";
import { companyPrompt, readYesNo } from "../src/verify/language.js";

const DEFAULT_MODEL = "claude-sonnet-5-5";
const MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export class HeldOutStop extends Error {
  readonly exitCode: number;

  constructor(exitCode: number, message: string) {
    super(message);
    this.name = "HeldOutStop";
    this.exitCode = exitCode;
  }
}

export interface HeldOutClaudeRow {
  text: string;
  truth: "company" | "not_company";
  leftOutOfList: boolean;
  raw: string;
  answer: "yes" | "no" | null;
  payment: "capture" | "void" | "human";
  correct: boolean;
}

export interface HeldOutClaudeReport {
  n: number;
  companies: number;
  notCompanies: number;
  correct: number;
  accuracy: number;
  capture: number;
  void: number;
  human: number;
  wrong: HeldOutClaudeRow[];
  rows: HeldOutClaudeRow[];
  model: string;
  retrieved_at: string;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface HeldOutClaudeOptions {
  env: Record<string, string | undefined>;
  fetchImpl: FetchLike;
  now?: Date;
  names?: readonly HeldOutName[];
}

function requireKey(env: Record<string, string | undefined>): string {
  const key = env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (key === "") throw new HeldOutStop(2, "ANTHROPIC_API_KEY is not set");
  return key;
}

function textFromClaude(payload: unknown): string {
  if (payload === null || typeof payload !== "object") return "";
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const record = block as { type?: unknown; text?: unknown };
    if (record.type === "thinking") continue;
    if (record.type === "text" && typeof record.text === "string") return record.text;
  }
  return "";
}

async function askClaude(fetchImpl: FetchLike, key: string, model: string, text: string): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        thinking: { type: "between_tools" },
        messages: [{ role: "user", content: companyPrompt(text) }],
      }),
    });
  } catch {
    throw new Error("claude request failed");
  }
  if (!res.ok) throw new Error("claude request failed");
  try {
    return textFromClaude(await res.json());
  } catch {
    return "";
  }
}

export async function runHeldOutClaude(options: HeldOutClaudeOptions): Promise<HeldOutClaudeReport> {
  const key = requireKey(options.env);
  const model = options.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const names = options.names ?? HELD_OUT_NAMES;
  const retrievedAt = (options.now ?? new Date()).toISOString();
  const rows: HeldOutClaudeRow[] = [];
  for (const row of names) {
    const raw = await askClaude(options.fetchImpl, key, model, row.text);
    const answer = readYesNo(raw);
    const payment = answer === "yes" ? "capture" : answer === "no" ? "void" : "human";
    const correct = (row.truth === "company" && answer === "yes") || (row.truth === "not_company" && answer === "no");
    rows.push({
      text: row.text,
      truth: row.truth,
      leftOutOfList: row.leftOutOfList === true,
      raw,
      answer,
      payment,
      correct,
    });
  }
  const correct = rows.filter((row) => row.correct).length;
  return {
    n: rows.length,
    companies: rows.filter((row) => row.truth === "company").length,
    notCompanies: rows.filter((row) => row.truth === "not_company").length,
    correct,
    accuracy: correct / rows.length,
    capture: rows.filter((row) => row.payment === "capture").length,
    void: rows.filter((row) => row.payment === "void").length,
    human: rows.filter((row) => row.payment === "human").length,
    wrong: rows.filter((row) => !row.correct),
    rows,
    model,
    retrieved_at: retrievedAt,
  };
}

async function main(): Promise<number> {
  try {
    const report = await runHeldOutClaude({
      env: process.env,
      fetchImpl: (url, init) => fetch(url, init),
      now: new Date(),
    });
    for (const row of report.rows) {
      console.error(`${row.text}\t${row.answer ?? "unusable"}\t${row.payment}`);
    }
    console.log(JSON.stringify(report, null, 2));
    return 0;
  } catch (err) {
    const code = err instanceof HeldOutStop ? err.exitCode : 1;
    const line = err instanceof HeldOutStop ? err.message : "claude request failed";
    console.error(line);
    return code;
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exit(await main());
}

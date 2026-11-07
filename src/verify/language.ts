import type { ConditionSpec, FixedCondition } from "./condition.js";
import { valuesAt } from "./paths.js";
import { humanBandScore, instructionShape, type ScoreInput } from "./score.js";

/**
 * Qwen3-0.6B-Instruct, q4f16 ONNX. Public, no key.
 * A longer prompt that included the request made every answer "yes", including weather.
 * The question below is the one that separated company names from weather and food.
 */
export const LANGUAGE_MODEL_ID = "onnx-community/Qwen3-0.6B-ONNX";
export const LANGUAGE_DTYPE = "q4f16";
/** Bytes of onnx/model_q4f16.onnx, measured 2026-11-07. */
export const LANGUAGE_WEIGHT_BYTES = 569_789_750;
/** Above this, the static page does not download the language model. */
export const BROWSER_WEIGHT_LIMIT_BYTES = 120_000_000;

export function browserCanRunLanguageModel(): boolean {
  return LANGUAGE_WEIGHT_BYTES <= BROWSER_WEIGHT_LIMIT_BYTES;
}

export interface LanguageScore {
  score: number;
  reasons: string[];
  suspicious_fields: string[];
}

export type LanguageAsk = (prompt: string) => Promise<string>;

const SCORE_KEYS = ["reasons", "score", "suspicious_fields"];

function unusable(): Error {
  return new Error("scorer returned an unusable answer");
}

/** The only question the measured model answers without calling everything a company. */
export function companyPrompt(value: string): string {
  return `Is ${JSON.stringify(value)} a company name? Answer yes or no.`;
}

export function readYesNo(text: string): "yes" | "no" | null {
  const cleaned = text.trim().replace(/^answer:\s*/i, "");
  const match = /^(yes|no)\b/i.exec(cleaned);
  if (!match?.[1]) return null;
  return match[1].toLowerCase() === "yes" ? "yes" : "no";
}

/** Free-text fields. Codes and URLs stay with the rule checks. */
export function contentFieldPaths(spec: ConditionSpec): string[] {
  const paths: string[] = [];
  for (const [path, type] of Object.entries(spec.fields)) {
    if (type !== "string") continue;
    const pattern = spec.patterns?.[path];
    if (pattern !== undefined && !pattern.includes(" ")) continue;
    paths.push(path);
  }
  return paths;
}

export function parseLanguageScore(text: string): LanguageScore {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw unusable();
  let value: unknown;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw unusable();
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw unusable();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== SCORE_KEYS.join(",")) throw unusable();
  const { score, reasons, suspicious_fields: fields } = record;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) throw unusable();
  if (!Array.isArray(reasons) || reasons.length === 0 || reasons.some((reason) => typeof reason !== "string" || reason.trim() === "" || reason.length > 160)) {
    throw unusable();
  }
  if (!Array.isArray(fields) || fields.some((field) => typeof field !== "string" || field.trim() === "")) throw unusable();
  return {
    score,
    reasons: reasons.map((reason: string) => reason.trim()),
    suspicious_fields: [...new Set(fields.map((field: string) => field.trim()))],
  };
}

export function isLanguageScore(value: unknown): value is LanguageScore {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.score === "number" && Array.isArray(record.reasons) && Array.isArray(record.suspicious_fields);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export async function languageScore(spec: ConditionSpec, data: unknown, ask: LanguageAsk): Promise<LanguageScore> {
  const suspicious: string[] = [];
  const reasons: string[] = [];
  let mismatch = false;
  for (const path of contentFieldPaths(spec)) {
    for (const value of valuesAt(data, path).values) {
      if (typeof value !== "string") continue;
      const answer = readYesNo(await ask(companyPrompt(value)));
      if (!answer) throw unusable();
      if (instructionShape(value)) {
        suspicious.push(path);
        reasons.push(`instruction in ${path}`);
      } else if (answer === "no") {
        mismatch = true;
        reasons.push(`${path} is not a company`);
      }
    }
  }
  const built: LanguageScore = suspicious.length > 0
    ? { score: humanBandScore(spec.ai), reasons: unique(reasons), suspicious_fields: unique(suspicious) }
    : mismatch
      ? { score: 0.15, reasons: unique(reasons), suspicious_fields: [] }
      : { score: 0.95, reasons: ["company names match the request"], suspicious_fields: [] };
  return parseLanguageScore(JSON.stringify(built));
}

export function languageDetail(cond: FixedCondition, ask: LanguageAsk = activeLanguageAsk()) {
  return (input: ScoreInput) => languageScore(cond.spec, input.data, ask);
}

let askOverride: LanguageAsk | null = null;
let pipelinePromise: Promise<(prompt: string) => Promise<string>> | null = null;

/** Tests install a fake here so the suite never downloads a model. */
export function useLanguageAsk(ask: LanguageAsk | null): void {
  askOverride = ask;
}

export function activeLanguageAsk(): LanguageAsk {
  return askOverride ?? transformersAsk;
}

/** Lazy Qwen3 asker. Weights land in `.cache/transformers`. No hub token is sent. */
export async function transformersAsk(prompt: string): Promise<string> {
  if (!pipelinePromise) pipelinePromise = loadAsker();
  const ask = await pipelinePromise;
  return ask(prompt);
}

async function loadAsker(): Promise<(prompt: string) => Promise<string>> {
  delete process.env.HF_TOKEN;
  delete process.env.HF_ACCESS_TOKEN;
  delete process.env.HUGGING_FACE_HUB_TOKEN;
  const mod = (await import("@huggingface/transformers")) as {
    pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<
      (messages: { role: string; content: string }[], opts: Record<string, unknown>) => Promise<{ generated_text?: { content?: string }[] }[]>
    >;
    env: { cacheDir: string; allowLocalModels: boolean };
  };
  mod.env.cacheDir = `${process.cwd()}/.cache/transformers`;
  mod.env.allowLocalModels = false;
  const generator = await mod.pipeline("text-generation", LANGUAGE_MODEL_ID, {
    dtype: LANGUAGE_DTYPE,
    device: "cpu",
  });
  return async (prompt: string) => {
    const output = await generator([{ role: "user", content: prompt }], {
      max_new_tokens: 6,
      do_sample: false,
      tokenizer_encode_kwargs: { enable_thinking: false },
    });
    const content = output?.[0]?.generated_text?.at?.(-1)?.content;
    if (typeof content !== "string" || content.trim() === "") throw unusable();
    return content;
  };
}

import type { FieldType, FixedCondition } from "./condition.js";
import { valuesAt } from "./paths.js";
import { scorerFromEnv } from "./score.js";

/** What the seller sent back after payment. The body is untrusted data, never instructions. */
export interface Delivery {
  httpStatus: number;
  body: string;
  latencyMs: number;
}

export const OUTCOMES = ["capture", "void", "human"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const REASON_CODES = [
  "ok",
  "paid_5xx",
  "paid_4xx",
  "non_2xx",
  "empty_200",
  "not_json",
  "shape_mismatch",
  "out_of_range",
  "late",
  "score_low",
  "score_uncertain",
  "scorer_invalid",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const CHECK_NAMES = ["http_2xx", "non_empty", "json", "shape", "values", "latency", "ai_score"] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

/** The verdict schema is fixed. There is no amount in it: amounts come from code, never from the judge. */
export interface Verdict {
  outcome: Outcome;
  conditionId: string;
  reason: ReasonCode;
  checks: { name: CheckName; pass: boolean }[];
  score: number | null;
}

/**
 * Pluggable AI scorer. It receives the parsed delivery as inert data and returns one number in [0,1].
 * Anything else (text, objects, NaN, out of range, a throw) is treated as "unsure" → human.
 */
export interface ScorerInput {
  readonly conditionDescription: string;
  readonly data: unknown;
}
export type Scorer = (input: ScorerInput) => number | Promise<number>;

function hasType(v: unknown, t: FieldType): boolean {
  switch (t) {
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "integer":
      return typeof v === "number" && Number.isSafeInteger(v);
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v);
    case "object":
      return v !== null && typeof v === "object" && !Array.isArray(v);
  }
}

function isEmptyPayload(v: unknown): boolean {
  if (v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

// ---------------------------------------------------------------- deterministic scorer

/**
 * Deterministic stand-in: the share of declared string values that are non-blank.
 * Kept for callers that want a score with no model. The default scorer is the embedding one.
 */
export function completenessScorer(stringPaths: readonly string[]): Scorer {
  return ({ data }) => {
    let total = 0;
    let filled = 0;
    for (const p of stringPaths) {
      for (const v of valuesAt(data, p).values) {
        total += 1;
        if (typeof v === "string" && v.trim() !== "") filled += 1;
      }
    }
    return total === 0 ? 1 : filled / total;
  };
}

/** Default scorer: local embeddings, or Claude when ANTHROPIC_API_KEY is set. Still returns one number. */
export function defaultScorerFor(cond: FixedCondition): Scorer {
  return scorerFromEnv(cond, process.env);
}

// ---------------------------------------------------------------- the judge

function verdict(
  cond: FixedCondition,
  outcome: Outcome,
  reason: ReasonCode,
  checks: Verdict["checks"],
  score: number | null,
): Verdict {
  const v: Verdict = { outcome, conditionId: cond.conditionId, reason, checks, score };
  assertVerdict(v);
  return Object.freeze({ ...v, checks: Object.freeze(checks.map((c) => Object.freeze({ ...c }))) as Verdict["checks"] });
}

function deepFreezeData<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreezeData(v);
    Object.freeze(o);
  }
  return o;
}

/**
 * Judge one delivery against a fixed condition. Code decides; the scorer only supplies a number.
 * Order: HTTP status → empty → JSON → shape → values → latency → score.
 */
export async function judge(cond: FixedCondition, d: Delivery, scorer?: Scorer): Promise<Verdict> {
  const spec = cond.spec;
  const checks: Verdict["checks"] = [];
  const fail = (name: CheckName, outcome: Outcome, reason: ReasonCode) => {
    checks.push({ name, pass: false });
    return verdict(cond, outcome, reason, checks, null);
  };

  if (!(d.httpStatus >= 200 && d.httpStatus < 300)) {
    return fail("http_2xx", "void", d.httpStatus >= 500 ? "paid_5xx" : d.httpStatus >= 400 ? "paid_4xx" : "non_2xx");
  }
  checks.push({ name: "http_2xx", pass: true });

  const body = typeof d.body === "string" ? d.body : "";
  if (body.trim() === "") return fail("non_empty", "void", "empty_200");

  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    checks.push({ name: "non_empty", pass: true });
    return fail("json", "void", "not_json");
  }
  const arraysAllEmpty =
    Object.keys(spec.minItems ?? {}).length > 0 &&
    Object.keys(spec.minItems ?? {}).every((p) => {
      const at = valuesAt(data, p);
      return at.found && at.values.every((v) => Array.isArray(v) && v.length === 0);
    });
  if (isEmptyPayload(data) || arraysAllEmpty) return fail("non_empty", "void", "empty_200");
  checks.push({ name: "non_empty", pass: true });
  checks.push({ name: "json", pass: true });

  for (const [path, type] of Object.entries(spec.fields)) {
    const at = valuesAt(data, path);
    if (!at.found || at.values.some((v) => !hasType(v, type))) return fail("shape", "void", "shape_mismatch");
  }
  for (const [path, min] of Object.entries(spec.minItems ?? {})) {
    const at = valuesAt(data, path);
    if (!at.found || at.values.some((v) => !Array.isArray(v) || v.length < min)) {
      return fail("shape", "void", "shape_mismatch");
    }
  }
  checks.push({ name: "shape", pass: true });

  for (const [path, r] of Object.entries(spec.ranges ?? {})) {
    for (const v of valuesAt(data, path).values) {
      if (typeof v !== "number" || (r.min !== undefined && v < r.min) || (r.max !== undefined && v > r.max)) {
        return fail("values", "void", "out_of_range");
      }
    }
  }
  for (const [path, src] of Object.entries(spec.patterns ?? {})) {
    const re = new RegExp(`^(?:${src})$`, "u");
    for (const v of valuesAt(data, path).values) {
      if (typeof v !== "string" || !re.test(v)) return fail("values", "void", "out_of_range");
    }
  }
  checks.push({ name: "values", pass: true });

  if (spec.maxLatencyMs !== undefined && !(d.latencyMs <= spec.maxLatencyMs)) {
    return fail("latency", "human", "late");
  }
  checks.push({ name: "latency", pass: true });

  // The scorer sees a frozen copy of the parsed data as a value. Its answer is one number or nothing.
  let score: number;
  try {
    const raw: unknown = await (scorer ?? defaultScorerFor(cond))({
      conditionDescription: spec.description,
      data: deepFreezeData(structuredClone(data)),
    });
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > 1) {
      return fail("ai_score", "human", "scorer_invalid");
    }
    score = raw;
  } catch {
    return fail("ai_score", "human", "scorer_invalid");
  }
  if (score >= spec.ai.passAt) {
    checks.push({ name: "ai_score", pass: true });
    return verdict(cond, "capture", "ok", checks, score);
  }
  checks.push({ name: "ai_score", pass: false });
  return verdict(cond, score < spec.ai.voidBelow ? "void" : "human", score < spec.ai.voidBelow ? "score_low" : "score_uncertain", checks, score);
}

// ---------------------------------------------------------------- output schema

const VERDICT_KEYS = ["checks", "conditionId", "outcome", "reason", "score"];

/** Rejects anything that is not exactly a Verdict (extra keys, unknown enums, stray amounts). */
export function assertVerdict(v: unknown): asserts v is Verdict {
  if (v === null || typeof v !== "object") throw new TypeError("verdict must be an object");
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  if (keys.join(",") !== VERDICT_KEYS.join(",")) throw new TypeError(`verdict keys must be exactly ${VERDICT_KEYS}`);
  if (!OUTCOMES.includes(o.outcome as Outcome)) throw new TypeError("bad outcome");
  if (!REASON_CODES.includes(o.reason as ReasonCode)) throw new TypeError("bad reason");
  if (typeof o.conditionId !== "string" || !o.conditionId.startsWith("cond_")) throw new TypeError("bad conditionId");
  if (!(o.score === null || (typeof o.score === "number" && o.score >= 0 && o.score <= 1))) throw new TypeError("bad score");
  if (!Array.isArray(o.checks)) throw new TypeError("checks must be an array");
  for (const c of o.checks as unknown[]) {
    const cc = c as Record<string, unknown>;
    if (Object.keys(cc).sort().join(",") !== "name,pass") throw new TypeError("bad check");
    if (!CHECK_NAMES.includes(cc.name as CheckName) || typeof cc.pass !== "boolean") throw new TypeError("bad check");
  }
}

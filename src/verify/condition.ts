import { canonicalJson, sha256Hex } from "../ledger/index.js";

export type FieldType = "string" | "number" | "integer" | "boolean" | "array" | "object";

/**
 * The acceptance condition, fixed before authorization.
 * Paths: "records" is a top-level key, "records[].name" is the key on every element of records.
 */
export interface ConditionSpec {
  version: 1;
  description: string;
  /** Shape: required paths and their JSON types. */
  fields: Record<string, FieldType>;
  /** Minimum length for array paths. */
  minItems?: Record<string, number>;
  /** Value ranges for numeric paths (inclusive). */
  ranges?: Record<string, { min?: number; max?: number }>;
  /** Formats for string paths (regex source, anchored by the caller). */
  patterns?: Record<string, string>;
  /** Score ≥ passAt → capture; score < voidBelow → void; between → human. */
  ai: { passAt: number; voidBelow: number };
  /** Deliveries slower than this go to a person. */
  maxLatencyMs?: number;
}

export interface FixedCondition {
  readonly conditionId: string;
  readonly spec: Readonly<ConditionSpec>;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}

export function conditionIdOf(spec: ConditionSpec): string {
  return `cond_${sha256Hex(canonicalJson(spec))}`;
}

export function validateSpec(spec: ConditionSpec): void {
  if (spec.version !== 1) throw new TypeError("condition version must be 1");
  if (Object.keys(spec.fields).length === 0) throw new TypeError("condition needs at least one field");
  const { passAt, voidBelow } = spec.ai;
  for (const [k, v] of Object.entries({ passAt, voidBelow })) {
    if (typeof v !== "number" || !(v >= 0 && v <= 1)) throw new TypeError(`ai.${k} must be in [0,1]`);
  }
  if (voidBelow > passAt) throw new TypeError("ai.voidBelow must be ≤ ai.passAt");
  for (const src of Object.values(spec.patterns ?? {})) new RegExp(src);
}

/** Fix a condition: validate, freeze a copy, and name it by the hash of its content. */
export function fixCondition(spec: ConditionSpec): FixedCondition {
  validateSpec(spec);
  const copy = deepFreeze(structuredClone(spec));
  return Object.freeze({ conditionId: conditionIdOf(copy), spec: copy });
}

/** Conditions are registered before authorization and re-hashed whenever they are read. */
export class ConditionRegistry {
  private readonly byId = new Map<string, FixedCondition>();

  register(spec: ConditionSpec): string {
    const fixed = fixCondition(spec);
    this.byId.set(fixed.conditionId, fixed);
    return fixed.conditionId;
  }

  has(conditionId: string): boolean {
    return this.byId.has(conditionId);
  }

  get(conditionId: string): FixedCondition {
    const c = this.byId.get(conditionId);
    if (!c) throw new Error(`unknown condition ${conditionId}`);
    if (conditionIdOf(c.spec as ConditionSpec) !== conditionId) throw new Error(`condition ${conditionId} changed`);
    return c;
  }
}

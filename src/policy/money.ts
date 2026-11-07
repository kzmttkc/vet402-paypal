/**
 * All money is integer cents computed by code. A language model never produces an amount:
 * prices come from the job plan, capture totals are sums of those prices.
 */
import type { Cents } from "../rail/types.js";

export function isCents(v: unknown): v is Cents {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}

export function assertPositiveCents(v: unknown, label = "amount"): asserts v is Cents {
  if (!isCents(v) || v === 0) throw new TypeError(`${label} must be a positive integer of cents, got ${String(v)}`);
}

/** "20.00" → 2000. Only for amounts typed into code or config by a person. */
export function centsFromDecimal(s: string): Cents {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) throw new TypeError(`not a decimal amount: ${s}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

export function sumCents(values: readonly Cents[]): Cents {
  let t = 0;
  for (const v of values) {
    if (!isCents(v)) throw new TypeError(`not cents: ${String(v)}`);
    t += v;
  }
  if (!Number.isSafeInteger(t)) throw new RangeError("cents overflow");
  return t;
}

export function formatUsd(c: Cents): string {
  return `$${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

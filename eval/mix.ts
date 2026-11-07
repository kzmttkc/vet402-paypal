import type { ExportRow } from "../src/sellers/aggregate.js";

/** Deliveries slower than this count as "late" (≈ p99 of paid 2xx latency in the 2026-11-07 export). */
export const LATE_MS = 15_000;

export const MEASURED_TYPES = ["honest", "shape", "paid_4xx", "paid_5xx", "late"] as const;
export const FIXED_TYPES = ["empty_200", "injection", "instruction_in_field", "wrong_content"] as const;
export type CaseType = (typeof MEASURED_TYPES)[number] | (typeof FIXED_TYPES)[number];

/**
 * Failure mix measured on settled purchases in the export. Buckets are disjoint, assigned in this order:
 *   paid_5xx  http_status_paid 5xx
 *   paid_4xx  http_status_paid 4xx
 *   late      2xx and latency_ms > LATE_MS
 *   shape     2xx and l2_schema = mismatch
 *   honest    2xx and l2_schema = match
 * Rows with no declared shape (no_declaration / not_checked) have no ground truth and are left out.
 * The export has no column for empty bodies, injected text, an instruction hidden in a valid field,
 * or a shape-valid delivery whose names are not companies. Those types are added at fixed counts.
 */
export function measureMix(rows: readonly ExportRow[]): Record<(typeof MEASURED_TYPES)[number], number> {
  const mix = { honest: 0, shape: 0, paid_4xx: 0, paid_5xx: 0, late: 0 };
  for (const r of rows) {
    if (r.status !== "settled" || !/^\d{3}$/.test(r.http_status_paid)) continue;
    const h = Number(r.http_status_paid);
    if (h >= 500) mix.paid_5xx++;
    else if (h >= 400) mix.paid_4xx++;
    else if (h >= 200 && h < 300) {
      const lat = Number(r.latency_ms);
      if (Number.isFinite(lat) && lat > LATE_MS) mix.late++;
      else if (r.l2_schema === "mismatch") mix.shape++;
      else if (r.l2_schema === "match") mix.honest++;
    }
  }
  return mix;
}

/** Largest-remainder allocation of `total` cases, at least `min` per type. */
export function allocate(mix: Record<string, number>, total: number, min: number): Record<string, number> {
  const keys = Object.keys(mix);
  const sum = keys.reduce((a, k) => a + mix[k]!, 0);
  const free = total - min * keys.length;
  const raw = keys.map((k) => ({ k, exact: (mix[k]! / sum) * free }));
  const out: Record<string, number> = {};
  for (const r of raw) out[r.k] = min + Math.floor(r.exact);
  let left = total - Object.values(out).reduce((a, b) => a + b, 0);
  for (const r of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1))) {
    if (left-- <= 0) break;
    out[r.k]! += 1;
  }
  return out;
}

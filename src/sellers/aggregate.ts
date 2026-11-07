/**
 * Seller track record from the vet402 public observatory export.
 * One "seller" here is one resource_key (a paid endpoint).
 * Columns used: resource_key, status, http_status_paid, l2_schema.
 */
export interface ExportRow {
  resource_key: string;
  status: string;
  http_status_paid: string;
  l2_schema: string;
  latency_ms: string;
}

export interface SellerStats {
  resourceKey: string;
  attempts: number;
  settled: number;
  /** HTTP status of the paid response, counted on settled purchases only. */
  paid2xx: number;
  paid4xx: number;
  paid5xx: number;
  /** Declared output shape vs what arrived (l2_schema), settled purchases only. */
  shapeMatch: number;
  shapeMismatch: number;
  /** match / (match + mismatch), null when nothing was checked. */
  shapeMatchRate: number | null;
  /** (4xx + 5xx after payment) / settled, null when nothing settled. */
  postPayErrorRate: number | null;
}

export interface ExportTotals {
  rows: number;
  sellers: number;
  settled: number;
  paid4xx: number;
  paid5xx: number;
  shapeMatch: number;
  shapeMismatch: number;
}

function httpClass(s: string): "2xx" | "4xx" | "5xx" | "other" {
  if (!/^\d{3}$/.test(s)) return "other";
  const n = Number(s);
  return n >= 500 ? "5xx" : n >= 400 ? "4xx" : n >= 200 && n < 300 ? "2xx" : "other";
}

export function aggregateSellers(rows: readonly ExportRow[]): Map<string, SellerStats> {
  const m = new Map<string, SellerStats>();
  for (const r of rows) {
    let s = m.get(r.resource_key);
    if (!s) {
      s = {
        resourceKey: r.resource_key,
        attempts: 0,
        settled: 0,
        paid2xx: 0,
        paid4xx: 0,
        paid5xx: 0,
        shapeMatch: 0,
        shapeMismatch: 0,
        shapeMatchRate: null,
        postPayErrorRate: null,
      };
      m.set(r.resource_key, s);
    }
    s.attempts += 1;
    if (r.status !== "settled") continue;
    s.settled += 1;
    const h = httpClass(r.http_status_paid);
    if (h === "2xx") s.paid2xx += 1;
    else if (h === "4xx") s.paid4xx += 1;
    else if (h === "5xx") s.paid5xx += 1;
    if (r.l2_schema === "match") s.shapeMatch += 1;
    else if (r.l2_schema === "mismatch") s.shapeMismatch += 1;
  }
  for (const s of m.values()) {
    const checked = s.shapeMatch + s.shapeMismatch;
    s.shapeMatchRate = checked ? s.shapeMatch / checked : null;
    s.postPayErrorRate = s.settled ? (s.paid4xx + s.paid5xx) / s.settled : null;
  }
  return m;
}

export function totalsOf(rows: readonly ExportRow[], sellers = aggregateSellers(rows)): ExportTotals {
  const t: ExportTotals = { rows: rows.length, sellers: sellers.size, settled: 0, paid4xx: 0, paid5xx: 0, shapeMatch: 0, shapeMismatch: 0 };
  for (const s of sellers.values()) {
    t.settled += s.settled;
    t.paid4xx += s.paid4xx;
    t.paid5xx += s.paid5xx;
    t.shapeMatch += s.shapeMatch;
    t.shapeMismatch += s.shapeMismatch;
  }
  return t;
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/**
 * A perfect record of a few deliveries is not treated as a perfect record of many.
 * Score = shape matches / (checked deliveries + this prior).
 */
export const TRACK_RECORD_PRIOR = 30;

export type OutletKind = "company" | "headers" | "other";

/** Shown when the frozen export has no outlet for this job. It is not a paid endpoint. */
export const SAMPLE_SELLER_LINE = "Sample seller. No outlet in the frozen export matches this job.";

export const SAMPLE_SELLER: SellerStats = {
  resourceKey: "sample.seller",
  attempts: 0,
  settled: 0,
  paid2xx: 0,
  paid4xx: 0,
  paid5xx: 0,
  shapeMatch: 0,
  shapeMismatch: 0,
  shapeMatchRate: null,
  postPayErrorRate: null,
};

/** Company-data and header outlets are named in the resource key. Calendar "business days" are not company data. */
export function outletKind(resourceKey: string): OutletKind {
  const key = resourceKey.toLowerCase();
  if (key.includes("header")) return "headers";
  if (/business-days|business-time/.test(key)) return "other";
  if (/compan(?:y|ies)|entreprise|company-dossier|company_base|sec\/company/.test(key)) return "company";
  return "other";
}

export function jobKindFromBrief(brief: string): OutletKind {
  if (/\bcompan(?:y|ies)\b|会社/.test(brief)) return "company";
  if (/\bheaders?\b/i.test(brief)) return "headers";
  return "other";
}

/** Null when this seller has no checked shape to score. */
export function trackScore(seller: SellerStats): number | null {
  const checked = seller.shapeMatch + seller.shapeMismatch;
  if (seller.settled <= 0 || seller.shapeMatchRate === null || checked === 0) return null;
  return seller.shapeMatch / (checked + TRACK_RECORD_PRIOR);
}

function byTrackRecord(a: SellerStats, b: SellerStats): number {
  const score = (trackScore(b) ?? -1) - (trackScore(a) ?? -1);
  if (score !== 0) return score;
  const err = (a.postPayErrorRate ?? 1) - (b.postPayErrorRate ?? 1);
  if (err !== 0) return err;
  if (b.settled !== a.settled) return b.settled - a.settled;
  return a.resourceKey.localeCompare(b.resourceKey);
}

export interface SellerChoice {
  seller: SellerStats;
  sample: boolean;
}

/** One line for the approval card, in the Day 1 wording the tests locked. */
export function sellerCard(s: SellerStats): string {
  return `${s.resourceKey}: settled ${s.settled}, shape match ${pct(s.shapeMatchRate)} (${s.shapeMatch}/${s.shapeMatch + s.shapeMismatch}), errors after payment ${pct(s.postPayErrorRate)}`;
}

/**
 * The sentence on the approval card.
 * n = settled (paid) purchases, x = declared-shape match rate, y = 4xx/5xx after payment.
 * Computed from the frozen export. The CSV itself has no sentence.
 */
export function approvalSentence(s: SellerStats): string {
  return `${s.settled} paid purchases, ${pct(s.shapeMatchRate)} matched the promised shape, ${pct(s.postPayErrorRate)} errors after payment`;
}

/**
 * Seller for a new job, across every outlet.
 * A short perfect record is discounted: score = matches / (checked + {@link TRACK_RECORD_PRIOR}).
 * Ties break on fewer errors after payment, then more paid purchases, then the resource key.
 */
export function pickSeller(sellers: ReadonlyMap<string, SellerStats>): SellerStats {
  const list = [...sellers.values()].filter((s) => trackScore(s) !== null);
  list.sort(byTrackRecord);
  const top = list[0];
  if (!top) throw new Error("no settled seller with a shape check");
  return top;
}

/**
 * Same score, after keeping only outlets that sell this kind of data.
 * When the frozen export has none, the card says so instead of borrowing another outlet.
 */
export function pickSellerFor(sellers: ReadonlyMap<string, SellerStats>, kind: OutletKind): SellerChoice {
  if (kind !== "company" && kind !== "headers") return { seller: SAMPLE_SELLER, sample: true };
  const list = [...sellers.values()].filter((s) => trackScore(s) !== null && outletKind(s.resourceKey) === kind);
  list.sort(byTrackRecord);
  const top = list[0];
  if (!top) return { seller: SAMPLE_SELLER, sample: true };
  return { seller: top, sample: false };
}

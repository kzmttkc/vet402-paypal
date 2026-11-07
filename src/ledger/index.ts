import { createHash } from "node:crypto";

export type LedgerEntryType =
  | "allow" // policy allowed the payment decision
  | "deny" // refused before or at the rail
  | "authorize" // rail authorization created
  | "capture"
  | "void"
  | "refund"
  | "human" // routed to a person
  | "stop"; // emergency stop engaged

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export interface LedgerEntry {
  seq: number;
  ts: number;
  type: LedgerEntryType;
  jobId: string | null;
  data: { [k: string]: JsonValue };
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = "0".repeat(64);

/** Deterministic JSON: object keys sorted, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("non-finite number in ledger data");
    if (value === undefined) return "null";
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function entryHash(e: Omit<LedgerEntry, "hash">): string {
  return sha256Hex(
    canonicalJson({ seq: e.seq, ts: e.ts, type: e.type, jobId: e.jobId, data: e.data, prevHash: e.prevHash }),
  );
}

export type ChainCheck = { ok: true; length: number } | { ok: false; brokenAt: number; reason: string };

export class LedgerTamperedError extends Error {
  constructor(public readonly check: Extract<ChainCheck, { ok: false }>) {
    super(`ledger chain broken at seq ${check.brokenAt}: ${check.reason}`);
    this.name = "LedgerTamperedError";
  }
}

/**
 * Append-only hash-chained ledger. Each entry commits to the previous hash.
 * Rewriting any line changes its hash and breaks every link after it.
 */
export class Ledger {
  private readonly rows: LedgerEntry[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  static fromJsonl(text: string, now?: () => number): Ledger {
    const l = new Ledger(now);
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      l.rows.push(JSON.parse(line) as LedgerEntry);
    }
    return l;
  }

  get length(): number {
    return this.rows.length;
  }

  get headHash(): string {
    return this.rows.at(-1)?.hash ?? GENESIS_HASH;
  }

  append(type: LedgerEntryType, jobId: string | null, data: { [k: string]: JsonValue }): LedgerEntry {
    const base = {
      seq: this.rows.length,
      ts: this.now(),
      type,
      jobId,
      data: JSON.parse(canonicalJson(data)) as { [k: string]: JsonValue },
      prevHash: this.headHash,
    };
    const entry: LedgerEntry = { ...base, hash: entryHash(base) };
    this.rows.push(entry);
    return structuredClone(entry);
  }

  verifyChain(): ChainCheck {
    let prev = GENESIS_HASH;
    for (let i = 0; i < this.rows.length; i++) {
      const e = this.rows[i]!;
      if (e.seq !== i) return { ok: false, brokenAt: i, reason: `seq ${e.seq} at position ${i}` };
      if (e.prevHash !== prev) return { ok: false, brokenAt: i, reason: "prevHash does not match previous entry" };
      const { hash, ...rest } = e;
      if (entryHash(rest) !== hash) return { ok: false, brokenAt: i, reason: "entry content does not match its hash" };
      prev = hash;
    }
    return { ok: true, length: this.rows.length };
  }

  /** Throws LedgerTamperedError if the chain does not verify. */
  assertChain(): void {
    const c = this.verifyChain();
    if (!c.ok) throw new LedgerTamperedError(c);
  }

  entries(): LedgerEntry[] {
    return structuredClone(this.rows);
  }

  ofJob(jobId: string): LedgerEntry[] {
    return this.entries().filter((e) => e.jobId === jobId);
  }

  toJsonl(): string {
    return this.rows.map((r) => JSON.stringify(r)).join("\n") + (this.rows.length ? "\n" : "");
  }
}

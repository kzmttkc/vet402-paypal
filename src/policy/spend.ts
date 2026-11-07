import type { Cents } from "../rail/types.js";

interface Commitment {
  ts: number;
  /** Amount currently counted against the budget (held or captured). */
  cents: Cents;
}

const DAY = (t: number) => new Date(t).toISOString().slice(0, 10);
const MONTH = (t: number) => new Date(t).toISOString().slice(0, 7);

/**
 * What the mandate has committed: open authorizations count in full,
 * captured jobs count what was captured, voided jobs count zero.
 * Refunds do not give budget back (conservative).
 */
export class SpendBook {
  private readonly commitments = new Map<string, Commitment>();

  hold(jobId: string, cents: Cents, ts: number): void {
    this.commitments.set(jobId, { ts, cents });
  }

  settle(jobId: string, capturedCents: Cents): void {
    const c = this.commitments.get(jobId);
    if (c) c.cents = capturedCents;
  }

  release(jobId: string): void {
    this.settle(jobId, 0);
  }

  committed(): Cents {
    let t = 0;
    for (const c of this.commitments.values()) t += c.cents;
    return t;
  }

  committedOnDay(now: number): Cents {
    let t = 0;
    for (const c of this.commitments.values()) if (DAY(c.ts) === DAY(now)) t += c.cents;
    return t;
  }

  committedInMonth(now: number): Cents {
    let t = 0;
    for (const c of this.commitments.values()) if (MONTH(c.ts) === MONTH(now)) t += c.cents;
    return t;
  }
}

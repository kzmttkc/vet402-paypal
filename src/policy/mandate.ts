import type { Cents } from "../rail/types.js";
import { assertPositiveCents, isCents } from "./money.js";

/**
 * Autonomy levels, strictest first.
 *   careful   – a person approves every authorization
 *   balanced  – automatic only at or below autoApproveMaxCents
 *   autopilot – automatic within budget and caps
 */
export const AUTONOMY_LEVELS = ["careful", "balanced", "autopilot"] as const;
export type Autonomy = (typeof AUTONOMY_LEVELS)[number];

export interface Mandate {
  readonly id: string;
  readonly budgetCents: Cents;
  readonly allowedSellers: readonly string[];
  readonly expiresAt: number;
  readonly revoked: boolean;
  readonly autonomy: Autonomy;
  /** Balanced: authorizations at or below this go through without a person. */
  readonly autoApproveMaxCents: Cents;
  readonly dailyCapCents: Cents;
  readonly monthlyCapCents: Cents;
}

export class PolicyChangeRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyChangeRejected";
  }
}

export function createMandate(m: Mandate): Mandate {
  assertPositiveCents(m.budgetCents, "budgetCents");
  assertPositiveCents(m.dailyCapCents, "dailyCapCents");
  assertPositiveCents(m.monthlyCapCents, "monthlyCapCents");
  if (!isCents(m.autoApproveMaxCents)) throw new TypeError("autoApproveMaxCents must be integer cents");
  if (!AUTONOMY_LEVELS.includes(m.autonomy)) throw new TypeError(`unknown autonomy ${String(m.autonomy)}`);
  if (!Number.isFinite(m.expiresAt)) throw new TypeError("expiresAt must be a timestamp");
  return Object.freeze({ ...m, allowedSellers: Object.freeze([...m.allowedSellers]) });
}

/**
 * Holds the current mandate. Every change can only make spending stricter:
 * lower thresholds, lower caps, stricter autonomy, fewer sellers, earlier expiry, revoke.
 * There is no method that loosens a mandate; a looser one is a new mandate signed by a person.
 */
export class PolicyStore {
  private m: Mandate;

  constructor(mandate: Mandate) {
    this.m = createMandate(mandate);
  }

  get mandate(): Mandate {
    return this.m;
  }

  setAutoApproveMax(cents: Cents): void {
    if (!isCents(cents)) throw new TypeError("autoApproveMaxCents must be integer cents");
    if (cents > this.m.autoApproveMaxCents) {
      throw new PolicyChangeRejected(
        `approval threshold can only be tightened (${this.m.autoApproveMaxCents} → ${cents} is looser)`,
      );
    }
    this.m = createMandate({ ...this.m, autoApproveMaxCents: cents });
  }

  setAutonomy(level: Autonomy): void {
    if (AUTONOMY_LEVELS.indexOf(level) > AUTONOMY_LEVELS.indexOf(this.m.autonomy)) {
      throw new PolicyChangeRejected(`autonomy can only be tightened (${this.m.autonomy} → ${level} is looser)`);
    }
    this.m = createMandate({ ...this.m, autonomy: level });
  }

  setCaps(caps: { dailyCapCents?: Cents; monthlyCapCents?: Cents }): void {
    const daily = caps.dailyCapCents ?? this.m.dailyCapCents;
    const monthly = caps.monthlyCapCents ?? this.m.monthlyCapCents;
    if (daily > this.m.dailyCapCents || monthly > this.m.monthlyCapCents) {
      throw new PolicyChangeRejected("caps can only be lowered");
    }
    this.m = createMandate({ ...this.m, dailyCapCents: daily, monthlyCapCents: monthly });
  }

  removeSeller(sellerId: string): void {
    this.m = createMandate({ ...this.m, allowedSellers: this.m.allowedSellers.filter((s) => s !== sellerId) });
  }

  shortenExpiry(expiresAt: number): void {
    if (expiresAt > this.m.expiresAt) throw new PolicyChangeRejected("expiry can only be moved earlier");
    this.m = createMandate({ ...this.m, expiresAt });
  }

  revoke(): void {
    this.m = createMandate({ ...this.m, revoked: true });
  }
}

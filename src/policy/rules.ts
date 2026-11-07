import type { Cents } from "../rail/types.js";
import type { Mandate } from "./mandate.js";
import { isCents } from "./money.js";
import type { SpendBook } from "./spend.js";

/**
 * May the agent pay?  All must hold:
 *   amount ≤ remaining            (remaining = budget − committed)
 *   seller ∈ allowedSellers
 *   now < expiresAt
 *   ¬revoked
 * plus the daily and monthly caps.
 */
export type DenyReason =
  | "invalid_amount"
  | "over_remaining"
  | "seller_not_allowed"
  | "mandate_expired"
  | "mandate_revoked"
  | "over_daily_cap"
  | "over_monthly_cap";

export interface PayRequest {
  sellerId: string;
  amountCents: Cents;
}

export type PayDecision = { ok: true; remainingCents: Cents } | { ok: false; reasons: DenyReason[] };

export function canPay(m: Mandate, req: PayRequest, now: number, book: SpendBook): PayDecision {
  const reasons: DenyReason[] = [];
  const amountOk = isCents(req.amountCents) && req.amountCents > 0;
  if (!amountOk) reasons.push("invalid_amount");
  const remaining = m.budgetCents - book.committed();
  if (amountOk && req.amountCents > remaining) reasons.push("over_remaining");
  if (!m.allowedSellers.includes(req.sellerId)) reasons.push("seller_not_allowed");
  if (!(now < m.expiresAt)) reasons.push("mandate_expired");
  if (m.revoked) reasons.push("mandate_revoked");
  if (amountOk && book.committedOnDay(now) + req.amountCents > m.dailyCapCents) reasons.push("over_daily_cap");
  if (amountOk && book.committedInMonth(now) + req.amountCents > m.monthlyCapCents) reasons.push("over_monthly_cap");
  return reasons.length ? { ok: false, reasons } : { ok: true, remainingCents: remaining };
}

/** Checks repeated at capture time (the second look): expiry and revocation. */
export function stillValidAtCapture(m: Mandate, now: number): DenyReason[] {
  const r: DenyReason[] = [];
  if (!(now < m.expiresAt)) r.push("mandate_expired");
  if (m.revoked) r.push("mandate_revoked");
  return r;
}

export type ApprovalRoute = "auto" | "human";

export function approvalRoute(m: Mandate, amountCents: Cents): ApprovalRoute {
  switch (m.autonomy) {
    case "careful":
      return "human";
    case "balanced":
      return amountCents <= m.autoApproveMaxCents ? "auto" : "human";
    case "autopilot":
      return "auto"; // budget and caps were already enforced by canPay
  }
}

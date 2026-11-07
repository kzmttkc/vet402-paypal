import { PaymentEngine } from "../src/engine/index.js";
import { Ledger } from "../src/ledger/index.js";
import { PolicyStore, type Mandate } from "../src/policy/mandate.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import { ConditionRegistry } from "../src/verify/condition.js";
import type { Delivery, Scorer } from "../src/verify/judge.js";
import { COMPANY_RECORDS } from "../eval/condition.js";

export const T0 = Date.parse("2026-11-07T00:00:00Z");
export const DAY = 86_400_000;

export function clock(start = T0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms), set: (v: number) => (t = v) };
}

export function mandate(over: Partial<Mandate> = {}): Mandate {
  return {
    id: "m1",
    budgetCents: 20_000,
    allowedSellers: ["seller.good"],
    expiresAt: T0 + 7 * DAY,
    revoked: false,
    autonomy: "autopilot",
    autoApproveMaxCents: 5_000,
    dailyCapCents: 15_000,
    monthlyCapCents: 18_000,
    ...over,
  };
}

export function setup(opts: { mandate?: Partial<Mandate>; scorer?: Scorer; railNow?: () => number; ledger?: Ledger } = {}) {
  const c = clock();
  const rail = new MockPayPalRail({ now: opts.railNow ?? c.now });
  const conditions = new ConditionRegistry();
  const conditionId = conditions.register(COMPANY_RECORDS);
  const policy = new PolicyStore(mandate(opts.mandate));
  const engine = new PaymentEngine({ rail, policy, conditions, now: c.now, scorer: opts.scorer, ledger: opts.ledger });
  return { c, rail, conditions, conditionId, policy, engine };
}

export const goodRecords = [
  { name: "Kizuna Logistics", country: "JP", employees: 120, founded: 1998, source_url: "https://registry.example.org/c/1" },
  { name: "Northwind Foods", country: "US", employees: 4500, founded: 1972, source_url: "https://registry.example.org/c/2" },
];

export const good = (over: Partial<Delivery> = {}): Delivery => ({
  httpStatus: 200,
  body: JSON.stringify({ records: goodRecords }),
  latencyMs: 800,
  ...over,
});

export const item = (itemId: string, priceCents: number) => ({ itemId, priceCents });

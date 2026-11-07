import type { PaymentEngine } from "../engine/index.js";
import { sumCents } from "../policy/money.js";
import type { Delivery } from "../verify/judge.js";
import type { SellerStats } from "./aggregate.js";

/** Records in one authorization when the seller is new or uncertain. */
export const PART_SIZE = 5;

export interface CreditPlan {
  partSize: number;
  parts: number;
  reason: string;
}

export interface FundedParts {
  authorizations: number;
  capturedCents: number;
}

/**
 * Enough paid history, a high shape-match rate, and few errors after payment:
 * one hold for the whole job. Anyone else is held a few records at a time.
 */
/**
 * A real seller the established choice may name.
 * The label still comes from {@link creditPlan} on the job. A header outlet is skipped when any other seller qualifies.
 */
export function pickEstablishedSeller(sellers: ReadonlyMap<string, SellerStats>): SellerStats | null {
  const qualified = [...sellers.values()].filter((seller) => creditPlan(seller, 1).reason.startsWith("Established"));
  const pool = qualified.filter((seller) => !/header/i.test(seller.resourceKey));
  const list = pool.length > 0 ? pool : qualified;
  list.sort((a, b) => b.settled - a.settled || a.resourceKey.localeCompare(b.resourceKey));
  return list[0] ?? null;
}

export function creditPlan(seller: SellerStats, itemCount: number): CreditPlan {
  if (!Number.isInteger(itemCount) || itemCount < 1) throw new TypeError("itemCount must be a positive integer");
  const established =
    seller.settled >= 5 &&
    seller.shapeMatchRate !== null &&
    seller.shapeMatchRate >= 0.9 &&
    seller.postPayErrorRate !== null &&
    seller.postPayErrorRate <= 0.05;
  if (established) {
    return { partSize: itemCount, parts: 1, reason: "Established seller: one hold for the whole job" };
  }
  const parts = Math.ceil(itemCount / PART_SIZE);
  const label = seller.settled === 0 ? "New seller" : "Uncertain seller";
  const noun = parts === 1 ? "part" : "parts";
  return { partSize: Math.min(PART_SIZE, itemCount), parts, reason: `${label}: holding in ${parts} ${noun}` };
}

export function slicesOf<T>(items: readonly T[], partSize: number): T[][] {
  const size = Math.max(1, partSize);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Authorize one slice, capture what passed, then the next slice.
 * An established plan is a single slice, so it is one authorization.
 */
export async function fundInParts(opts: {
  engine: PaymentEngine;
  sellerId: string;
  conditionId: string;
  jobId: string;
  items: { itemId: string; priceCents: number }[];
  deliveries: Record<string, Delivery>;
  plan: CreditPlan;
}): Promise<FundedParts> {
  let authorizations = 0;
  let capturedCents = 0;
  const slices = slicesOf(opts.items, opts.plan.partSize);
  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i]!;
    const id = `${opts.jobId}:${i + 1}`;
    let result = await opts.engine.requestJob({
      jobId: id,
      sellerId: opts.sellerId,
      conditionId: opts.conditionId,
      items: slice.map((item) => ({ itemId: item.itemId, priceCents: item.priceCents })),
    });
    if (result.status === "pending_human") result = await opts.engine.approveJob(id, "buyer");
    if (result.status !== "authorized") break;
    authorizations += 1;
    const deliveries: Record<string, Delivery> = {};
    for (const item of slice) {
      const delivery = opts.deliveries[item.itemId];
      if (delivery) deliveries[item.itemId] = delivery;
    }
    result = await opts.engine.settle(id, deliveries);
    capturedCents = sumCents([capturedCents, result.capturedCents]);
    if (result.status === "needs_human") break;
  }
  return { authorizations, capturedCents };
}

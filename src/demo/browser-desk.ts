import { COMPANY_RECORDS } from "../../eval/condition.js";
import type { SellerStats } from "../sellers/aggregate.js";
import { Desk } from "../server/desk.js";
import { MockPayPalRail } from "../rail/mock.js";
import { completenessScorer } from "../verify/judge.js";

/**
 * The seller the live screen would pick from the frozen export
 * (counted 2026-11-07). The static page does not read the CSV.
 */
export const DEMO_SELLER: SellerStats = {
  resourceKey: "headers.use.x402atlas.com",
  attempts: 6,
  settled: 6,
  paid2xx: 6,
  paid4xx: 0,
  paid5xx: 0,
  shapeMatch: 6,
  shapeMismatch: 0,
  shapeMatchRate: 1,
  postPayErrorRate: 0,
};

export function demoSellers(): Map<string, SellerStats> {
  return new Map([[DEMO_SELLER.resourceKey, DEMO_SELLER]]);
}

/** Mock rail, judge, and ledger in memory. No files, no network, no keys. */
export function createDemoDesk(now?: () => number): Desk {
  const stringPaths = Object.entries(COMPANY_RECORDS.fields)
    .filter((entry): entry is [string, "string"] => entry[1] === "string")
    .map(([path]) => path);
  return new Desk({
    rail: new MockPayPalRail(),
    sellers: demoSellers(),
    scorer: completenessScorer(stringPaths),
    ...(now ? { now } : {}),
  });
}

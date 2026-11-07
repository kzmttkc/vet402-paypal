import { COMPANY_RECORDS } from "../../eval/condition.js";
import type { SellerStats } from "../sellers/aggregate.js";
import { Desk } from "../server/desk.js";
import { MockPayPalRail } from "../rail/mock.js";
import { completenessScorer, type Scorer } from "../verify/judge.js";

/**
 * The company-data seller the live screen picks from the frozen export
 * (counted 2026-11-07). The static page does not read the CSV.
 */
export const DEMO_SELLER: SellerStats = {
  resourceKey: "agent402.tools/api/skill/company-dossier",
  attempts: 3,
  settled: 3,
  paid2xx: 3,
  paid4xx: 0,
  paid5xx: 0,
  shapeMatch: 3,
  shapeMismatch: 0,
  shapeMatchRate: 1,
  postPayErrorRate: 0,
};

/**
 * First resource_key in the frozen export with no paid purchase
 * (localeCompare order, counted 2026-11-07). The static page does not read the CSV.
 */
export const DEMO_NEW_SELLER: SellerStats = {
  resourceKey: "10x402.com/lint",
  attempts: 1,
  settled: 0,
  paid2xx: 0,
  paid4xx: 0,
  paid5xx: 0,
  shapeMatch: 0,
  shapeMismatch: 0,
  shapeMatchRate: null,
  postPayErrorRate: null,
};

export function demoSellers(): Map<string, SellerStats> {
  return new Map([
    [DEMO_SELLER.resourceKey, DEMO_SELLER],
    [DEMO_NEW_SELLER.resourceKey, DEMO_NEW_SELLER],
  ]);
}

/** Mock rail, judge, and ledger in memory. No files, no network, no keys. */
export function createDemoDesk(now?: () => number, scorer?: Scorer): Desk {
  const stringPaths = Object.entries(COMPANY_RECORDS.fields)
    .filter((entry): entry is [string, "string"] => entry[1] === "string")
    .map(([path]) => path);
  return new Desk({
    rail: new MockPayPalRail(),
    sellers: demoSellers(),
    scorer: scorer ?? completenessScorer(stringPaths),
    ...(now ? { now } : {}),
  });
}

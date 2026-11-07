import { describe, expect, it } from "vitest";
import { creditPlan, fundInParts } from "../src/sellers/credit.js";
import { Desk } from "../src/server/desk.js";
import { aggregateSellers, loadFrozenExport, pickSeller, pickSellerFor, type SellerStats } from "../src/sellers/index.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import { good, setup } from "./helpers.js";

const established: SellerStats = {
  resourceKey: "established.example",
  attempts: 8,
  settled: 6,
  paid2xx: 6,
  paid4xx: 0,
  paid5xx: 0,
  shapeMatch: 6,
  shapeMismatch: 0,
  shapeMatchRate: 1,
  postPayErrorRate: 0,
};

const newbie: SellerStats = {
  resourceKey: "new.example",
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

const uncertain: SellerStats = {
  ...established,
  resourceKey: "uncertain.example",
  settled: 20,
  shapeMatch: 4,
  shapeMismatch: 16,
  shapeMatchRate: 0.2,
  postPayErrorRate: 0.3,
  paid4xx: 6,
};

function records(n: number, price = 100) {
  return Array.from({ length: n }, (_, i) => ({ itemId: `r${i + 1}`, priceCents: price }));
}

describe("seller track record decides the hold", () => {
  it("holds an established seller once for the whole job", () => {
    const plan = creditPlan(established, 25);
    expect(plan.parts).toBe(1);
    expect(plan.partSize).toBe(25);
    expect(plan.reason).toBe("Established seller: one hold for the whole job");
  });

  it("holds a new seller in five parts of five records", () => {
    const plan = creditPlan(newbie, 25);
    expect(plan.partSize).toBe(5);
    expect(plan.parts).toBe(5);
    expect(plan.reason).toBe("New seller: holding in 5 parts");
  });

  it("holds an uncertain seller in parts as well", () => {
    const plan = creditPlan(uncertain, 10);
    expect(plan.parts).toBe(2);
    expect(plan.partSize).toBe(5);
    expect(plan.reason).toBe("Uncertain seller: holding in 2 parts");
  });

  it("authorizes a new seller one part at a time and an established seller once", async () => {
    const items = records(10);
    const deliveries = Object.fromEntries(items.map((item) => [item.itemId, good()]));
    const mandate = { budgetCents: 50_000, dailyCapCents: 50_000, monthlyCapCents: 50_000, autoApproveMaxCents: 50_000 };

    const split = setup({ mandate, scorer: () => 0.95 });
    const parted = await fundInParts({
      engine: split.engine,
      sellerId: "seller.good",
      conditionId: split.conditionId,
      jobId: "parted",
      items,
      deliveries,
      plan: creditPlan(newbie, items.length),
    });
    expect(parted.authorizations).toBe(2);
    expect(split.rail.effectiveCalls("authorize")).toBe(2);
    expect(split.rail.effectiveCalls("capture")).toBe(2);
    expect(parted.capturedCents).toBe(1_000);

    const whole = setup({ mandate, scorer: () => 0.95 });
    const once = await fundInParts({
      engine: whole.engine,
      sellerId: "seller.good",
      conditionId: whole.conditionId,
      jobId: "whole",
      items,
      deliveries,
      plan: creditPlan(established, items.length),
    });
    expect(once.authorizations).toBe(1);
    expect(whole.rail.effectiveCalls("authorize")).toBe(1);
    expect(whole.rail.effectiveCalls("capture")).toBe(1);
    expect(once.capturedCents).toBe(1_000);
  });

  it("names a sample seller when no company outlet is in the set", () => {
    const headers: SellerStats = { ...established, resourceKey: "headers.use.x402atlas.com" };
    const desk = new Desk({
      rail: new MockPayPalRail(),
      sellers: new Map([[headers.resourceKey, headers]]),
      scorer: () => 0.95,
    });
    const card = desk.plan({ brief: "Collect company records", budgetCents: 5_000, autonomy: "careful" });
    expect(card.sellerSample).toBe(true);
    expect(card.sellerId).toBe("sample.seller");
    expect(card.sellerLine).toBe("Sample seller. No outlet in the frozen export matches this job.");
    expect(card.sellerId).not.toMatch(/header/i);
  });

  it("uses the frozen export: the picked seller is one hold, a seller with no paid purchases is five parts", () => {
    const sellers = aggregateSellers(loadFrozenExport().rows);
    const top = pickSeller(sellers);
    const fresh = [...sellers.values()].filter((seller) => seller.settled === 0).sort((a, b) => a.resourceKey.localeCompare(b.resourceKey))[0];
    expect(fresh).toBeTruthy();
    expect(creditPlan(top, 25).parts).toBe(1);
    const company = pickSellerFor(sellers, "company");
    expect(company.sample).toBe(false);
    expect(company.seller.resourceKey).not.toMatch(/header/i);
    expect(creditPlan(company.seller, 25).parts).toBeGreaterThan(1);
    expect(creditPlan(fresh!, 25).reason).toBe("New seller: holding in 5 parts");
  });

  it("puts the part line on the approval card and authorizes a new seller five times", async () => {
    const rail = new MockPayPalRail();
    const desk = new Desk({
      rail,
      sellers: new Map([
        [established.resourceKey, established],
        [newbie.resourceKey, newbie],
      ]),
      scorer: () => 0.95,
    });
    const card = desk.plan({ brief: "25 company records", budgetCents: 5_000, autonomy: "autopilot", seller: "new" });
    expect(card.holdReason).toBe("New seller: holding in 5 parts");
    expect(card.orderId).toBeNull();
    await desk.approve(card.jobId);
    await desk.settle(card.jobId, "honest");
    const auths = desk.activity().entries.filter((entry) => entry.type === "authorize");
    expect(auths).toHaveLength(5);
    expect(rail.effectiveCalls("authorize")).toBe(5);
    const done = desk.job(card.jobId);
    expect(done.capturedCents).toBe(5_000);
    expect(done.status).toBe("captured");
  });
});

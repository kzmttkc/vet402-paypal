import { afterEach, describe, expect, it } from "vitest";
import { deliveryFor } from "../src/server/deliveries.js";
import { Desk } from "../src/server/desk.js";
import { PaymentEngine } from "../src/engine/index.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import { judge, type Delivery } from "../src/verify/judge.js";
import { languageDetail, useLanguageAsk } from "../src/verify/language.js";
import { recordPrices } from "../src/pay/truth.js";
import { item, setup, T0 } from "./helpers.js";

const COUNT = 50;
const HOLD_CENTS = 5_000;
const ASK_MS = 300;

function markOf(outcome: string): "PASS" | "FAIL" | "HUMAN" {
  if (outcome === "capture") return "PASS";
  if (outcome === "void") return "FAIL";
  return "HUMAN";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ledgerRows(engine: PaymentEngine, jobId: string): Map<string, { outcome: string; reason: string }> {
  const rows = new Map<string, { outcome: string; reason: string }>();
  for (const entry of engine.ledger.ofJob(jobId)) {
    const judged = entry.data.judged;
    if (judged === null || typeof judged !== "object" || Array.isArray(judged)) continue;
    for (const [itemId, detail] of Object.entries(judged)) {
      if (detail === null || typeof detail !== "object" || Array.isArray(detail)) continue;
      const outcome = detail.outcome;
      const reason = detail.reason;
      if (typeof outcome === "string" && typeof reason === "string") rows.set(itemId, { outcome, reason });
    }
  }
  return rows;
}

describe("fifty honest records settle inside 20s", () => {
  afterEach(() => {
    useLanguageAsk(async () => "Yes.");
  });

  it("matches a serial judge when each ask waits 300ms", async () => {
    const answer = async (prompt: string) => (prompt.includes("Kizuna Logistics") || prompt.includes("Northwind Foods") ? "Yes." : "No.");
    const honest = deliveryFor("honest");
    const s = setup();
    const cond = s.conditions.get(s.conditionId);
    const serial = [];
    for (let i = 0; i < COUNT; i++) {
      const verdict = await judge(cond, honest, (input) => languageDetail(cond, answer)(input));
      serial.push({ mark: markOf(verdict.outcome), reason: verdict.reason });
    }

    useLanguageAsk(async (prompt) => {
      await delay(ASK_MS);
      return answer(prompt);
    });

    const prices = recordPrices(HOLD_CENTS, COUNT);
    const items = prices.map((priceCents, i) => item(`rec-${String(i + 1).padStart(2, "0")}`, priceCents));
    await s.engine.requestJob({ jobId: "job-50", sellerId: "seller.good", conditionId: s.conditionId, items });
    const deliveries: Record<string, Delivery> = {};
    for (const row of items) deliveries[row.itemId] = honest;

    const engineStarted = performance.now();
    const settled = await s.engine.settle("job-50", deliveries);
    const engineSeconds = (performance.now() - engineStarted) / 1000;
    console.info(`settle-50-engine ${engineSeconds.toFixed(2)}s`);

    const judged = ledgerRows(s.engine, "job-50");
    const fromSettle = items.map((row) => {
      const found = judged.get(row.itemId);
      return { mark: markOf(found?.outcome ?? ""), reason: found?.reason ?? "" };
    });
    expect(fromSettle).toEqual(serial);
    expect(settled.capturedCents).toBe(HOLD_CENTS);
    expect(engineSeconds).toBeLessThan(20);

    const desk = new Desk({ rail: new MockPayPalRail({ now: () => T0 }), now: () => T0 });
    const planned = desk.plan({
      brief: "Collect company records",
      budgetCents: HOLD_CENTS,
      autonomy: "autopilot",
      seller: "established",
    });
    expect(planned.items).toHaveLength(COUNT);
    await desk.approve(planned.jobId);
    const deskStarted = performance.now();
    const done = await desk.settle(planned.jobId, "honest");
    const deskSeconds = (performance.now() - deskStarted) / 1000;
    console.info(`settle-50-desk ${deskSeconds.toFixed(2)}s`);
    expect(done.items.map((row) => markOf(row.progress.startsWith("PASS") ? "capture" : row.progress.startsWith("FAIL") ? "void" : "human"))).toEqual(
      serial.map((row) => row.mark),
    );
    expect(done.capturedCents).toBe(HOLD_CENTS);
    expect(deskSeconds).toBeLessThan(20);
  }, 90_000);

  it("does not reuse a verdict when the same body is late", async () => {
    const s = setup();
    await s.engine.requestJob({
      jobId: "job-mix",
      sellerId: "seller.good",
      conditionId: s.conditionId,
      items: [item("late", 100), item("ok", 100)],
    });
    const result = await s.engine.settle("job-mix", {
      late: deliveryFor("unsure"),
      ok: deliveryFor("honest"),
    });
    expect(s.engine.job("job-mix")?.outcomes.late).toBe("human");
    expect(s.engine.job("job-mix")?.outcomes.ok).toBe("capture");
    expect(result.status).toBe("needs_human");
    expect(result.capturedCents).toBe(0);
  });
});

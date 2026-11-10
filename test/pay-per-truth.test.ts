import { describe, expect, it } from "vitest";
import { reasonSentence } from "../src/i18n/copy.js";
import { createApp } from "../src/server/app.js";
import { passedCaptureCents, settlePayPerTruth, truthLine, type TruthResult } from "../src/pay/truth.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import { setup, T0 } from "./helpers.js";

const HOLD = 5_000;
const COUNT = 50;
const PASSED = 37;

describe("pay per truth", () => {
  it("computes the capture in cents so 37 of 50 is exactly 37/50 of the hold", () => {
    const cents = passedCaptureCents(HOLD, COUNT, PASSED);
    expect(cents * COUNT).toBe(PASSED * HOLD);
    expect(truthLine(cents, HOLD)).toBe("Captured $37.00 of $50.00. $13.00 released.");
  });

  it("captures 37/50 of one authorization and releases the rest with final_capture", async () => {
    const s = setup();
    const done = await settlePayPerTruth(s.engine, s.conditionId, { holdCents: HOLD, count: COUNT, passed: PASSED });
    expect(done.status).toBe("captured");
    expect(done.capturedCents).toBe(passedCaptureCents(HOLD, COUNT, PASSED));
    expect(done.capturedCents * COUNT).toBe(PASSED * HOLD);
    expect(done.line).toBe("Captured $37.00 of $50.00. $13.00 released.");
    expect(s.rail.effectiveCalls("authorize")).toBe(1);
    expect(s.rail.effectiveCalls("capture")).toBe(1);
    expect(s.rail.effectiveCalls("void")).toBe(0);
    const cap = await s.rail.get(done.captureId!);
    expect(cap.kind).toBe("capture");
    if (cap.kind !== "capture") return;
    expect(cap.finalCapture).toBe(true);
    expect(cap.amountCents).toBe(done.capturedCents);
    const auth = await s.rail.get(done.authorizationId!);
    expect(auth.kind).toBe("authorization");
    if (auth.kind !== "authorization") return;
    expect(auth.amountCents).toBe(HOLD);
    expect(auth.status).toBe("CAPTURED");
    expect(auth.capturedCents).toBe(done.capturedCents);
    expect(done.rows.filter((row) => row.mark === "PASS")).toHaveLength(PASSED);
    expect(done.rows.filter((row) => row.mark === "FAIL")).toHaveLength(COUNT - PASSED);
    expect(done.rows.at(-1)?.capturedCents).toBe(done.capturedCents);
    expect(done.rows.at(-1)?.releasedCents).toBe(HOLD - done.capturedCents);
  });

  it("does not mark a pass when the scorer refuses every filled-in record", async () => {
    const s = setup({ scorer: () => 0 });
    const done = await settlePayPerTruth(s.engine, s.conditionId, { holdCents: HOLD, count: COUNT, passed: PASSED });
    expect(done.status).toBe("voided");
    expect(done.capturedCents).toBe(0);
    expect(done.rows.some((row) => row.mark === "PASS")).toBe(false);
    expect(s.rail.effectiveCalls("capture")).toBe(0);
  });

  it("voids the authorization when nothing passes", async () => {
    const s = setup();
    const done = await settlePayPerTruth(s.engine, s.conditionId, { holdCents: HOLD, count: COUNT, passed: 0 });
    expect(done.status).toBe("voided");
    expect(done.capturedCents).toBe(0);
    expect(done.captureId).toBeNull();
    expect(s.rail.effectiveCalls("capture")).toBe(0);
    expect(s.rail.effectiveCalls("void")).toBe(1);
    expect(s.rail.effectiveCalls("authorize")).toBe(1);
  });

  it("captures the whole hold when every record passes", async () => {
    const s = setup();
    const done = await settlePayPerTruth(s.engine, s.conditionId, { holdCents: HOLD, count: COUNT, passed: COUNT });
    expect(done.status).toBe("captured");
    expect(done.capturedCents).toBe(HOLD);
    expect(done.line).toBe("Captured $50.00 of $50.00. $0.00 released.");
    expect(s.rail.effectiveCalls("void")).toBe(0);
    const cap = await s.rail.get(done.captureId!);
    if (cap.kind !== "capture") throw new Error("expected a capture");
    expect(cap.finalCapture).toBe(true);
    expect(cap.amountCents).toBe(HOLD);
  });

  it("serves the 37/50 line from the screen route", async () => {
    const app = createApp({ rail: new MockPayPalRail({ now: () => T0 }), now: () => T0 });
    const res = await app.request("/api/pay-per-truth", { method: "POST", body: "{}" });
    const json = (await res.json()) as { line: string; capturedCents: number; holdCents: number; status: string };
    expect(res.status).toBe(200);
    expect(json.status).toBe("captured");
    expect(json.holdCents).toBe(HOLD);
    expect(json.capturedCents * COUNT).toBe(PASSED * HOLD);
    expect(json.line).toBe("Captured $37.00 of $50.00. $13.00 released.");
  });

  it("lists one FAIL row per released dollar, in arrival order, with the judge's reason", async () => {
    const app = createApp({ rail: new MockPayPalRail({ now: () => T0 }), now: () => T0 });
    const res = await app.request("/api/pay-per-truth", { method: "POST", body: "{}" });
    const json = (await res.json()) as TruthResult;
    expect(res.status).toBe(200);
    expect(json.line).toBe("Captured $37.00 of $50.00. $13.00 released.");
    const fails = json.rows.filter((row) => row.mark === "FAIL");
    expect(fails.length).toBeGreaterThan(0);
    expect(json.releasedCents).toBe(1_300);
    expect(fails).toHaveLength(json.releasedCents / 100);
    expect(json.rows).toHaveLength(COUNT);
    expect(json.rows.map((row) => row.mark)).toEqual([
      ...Array.from({ length: PASSED }, () => "PASS" as const),
      ...Array.from({ length: COUNT - PASSED }, () => "FAIL" as const),
    ]);
    for (const row of fails) {
      expect(row.reason).toBe("empty_200");
      expect(reasonSentence("en", row.reason)).toBe("The body was empty.");
      expect(reasonSentence("ja", row.reason)).toBe("本文が空でした。");
    }
    expect(fails.at(-1)?.releasedCents).toBe(json.releasedCents);
  });
});

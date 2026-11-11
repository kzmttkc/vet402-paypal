import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recordPrices, TRUTH_COUNT, TRUTH_HOLD_CENTS } from "../src/pay/truth.js";
import { sumCents } from "../src/policy/money.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import type { Delivery, Scorer } from "../src/verify/judge.js";
import {
  defaultDeliveries,
  judgeDeliveries,
  paypalCreds,
  runJudgedSandbox,
  type JudgedDelivery,
  type JudgedRunFile,
} from "../scripts/sandbox-judged.js";

function company(employees: number): Delivery {
  return {
    httpStatus: 200,
    body: JSON.stringify({
      records: [
        {
          name: "Kizuna Logistics",
          country: "JP",
          employees,
          founded: 1998,
          source_url: "https://registry.example.org/c/1",
        },
      ],
    }),
    latencyMs: 200,
  };
}

function rowsFor(mark: readonly ("pass" | "low" | "human" | "empty")[]): JudgedDelivery[] {
  const prices = recordPrices(TRUTH_HOLD_CENTS, TRUTH_COUNT);
  return mark.map((kind, i) => ({
    itemId: `rec-${String(i + 1).padStart(2, "0")}`,
    priceCents: prices[i]!,
    delivery:
      kind === "empty"
        ? { httpStatus: 200, body: "", latencyMs: 200 }
        : company(kind === "pass" ? 40 : kind === "human" ? 41 : 80),
  }));
}

const scorer: Scorer = ({ data }) => {
  const employees = (data as { records?: { employees?: number }[] }).records?.[0]?.employees;
  if (employees === 40) return 0.95;
  if (employees === 41) return 0.75;
  return 0.2;
};

describe("judged sandbox run", () => {
  it("captures the sum of the records the judge passed and writes the file", async () => {
    const marks = Array.from({ length: TRUTH_COUNT }, (_, i) => {
      if (i < 18) return "pass" as const;
      if (i < 34) return "low" as const;
      if (i === 34) return "human" as const;
      return "empty" as const;
    });
    const rows = rowsFor(marks);
    const judged = await judgeDeliveries(rows, scorer);
    const passed = sumCents(judged.filter((row) => row.outcome === "capture").map((row) => row.priceCents));
    expect(passed).toBeGreaterThan(0);
    expect(passed).toBeLessThan(TRUTH_HOLD_CENTS);

    const rail = new MockPayPalRail();
    const dir = mkdtempSync(join(tmpdir(), "sandbox-judged-"));
    const outPath = join(dir, "sandbox-judged-run.json");
    const now = new Date("2026-11-10T14:00:00.000Z");
    const file = await runJudgedSandbox({ rail, scorer, rows, outPath, now: () => now });

    expect(file.capturedCents).toBe(passed);
    expect(file.releasedCents).toBe(TRUTH_HOLD_CENTS - passed);
    expect(file.readBack.capture?.amountCents).toBe(passed);
    expect(file.readBack.capture?.finalCapture).toBe(true);
    expect(rail.effectiveCalls("capture")).toBe(1);
    expect(rail.effectiveCalls("void")).toBe(0);

    const written = JSON.parse(readFileSync(outPath, "utf8")) as JudgedRunFile;
    expect(written.at).toBe("2026-11-10T14:00:00.000Z");
    expect(written.holdCents).toBe(TRUTH_HOLD_CENTS);
    expect(written.records).toHaveLength(TRUTH_COUNT);
    expect(written.records.every((row) => typeof row.outcome === "string" && typeof row.reason === "string")).toBe(true);
    expect(written.capturedCents + written.releasedCents).toBe(written.holdCents);
    expect(written.readBack.order.id.length).toBeGreaterThan(0);
    expect(written.readBack.order.status.length).toBeGreaterThan(0);
    expect(written.readBack.authorization.id.length).toBeGreaterThan(0);
    expect(written.readBack.authorization.status.length).toBeGreaterThan(0);
    expect(written.readBack.capture).toEqual(file.readBack.capture);
    const again = await rail.get(written.readBack.capture!.id);
    expect(again.kind).toBe("capture");
    if (again.kind === "capture") expect(again.amountCents).toBe(passed);
  });

  it("does not read keys from the environment when they are absent", () => {
    expect(paypalCreds({})).toBeNull();
    expect(paypalCreds({ PAYPAL_ENV: "sandbox" })).toBeNull();
    expect(paypalCreds({ PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "" })).toBeNull();
    expect(paypalCreds({ PAYPAL_CLIENT_ID: "id", PAYPAL_CLIENT_SECRET: "secret" })).toBeNull();
    expect(defaultDeliveries()).toHaveLength(TRUTH_COUNT);
  });
});

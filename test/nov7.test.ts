import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { measureMix } from "../eval/mix.js";
import {
  CASE_A,
  CASE_C,
  CASE_D,
  FROZEN_EXPORT,
  GATE1,
  GATE2,
  REPLAY_EVENTS,
  SANDBOX_FINISHED_AT,
  SANDBOX_HOST,
  SANDBOX_RUN_ID,
  SANDBOX_STARTED_AT,
  tickerLine,
} from "../src/demo/nov7.js";
import { loadFrozenExport } from "../src/sellers/load.js";

describe("2026-11-07 record used on the screen", () => {
  it("keeps the $50 partial capture off the $20 order that starts with 2ES4", () => {
    const file = JSON.parse(readFileSync("docs/sandbox-run.json", "utf8")) as {
      host: string;
      run: string;
      startedAt: string;
      finishedAt: string;
      cases: Record<string, { order: { id: string; amount: string }; authorization: { id: string; amount: string }; capture?: { id: string; amount: string }; captureAfterVoid?: { issue: string; httpStatus: number }; refund?: { id: string } }>;
      gates: {
        gate1: { passed: boolean };
        gate2: { merchantInitiated: { order: { id: string; amount: string }; authorization: { id: string }; capture: { id: string; amount: string }; payment_source: string }; paymentToken: { id: string; card_brand: string; card_last_digits: string } };
      };
    };

    expect(file.run).toBe(SANDBOX_RUN_ID);
    expect(file.host).toBe(SANDBOX_HOST);
    expect(file.startedAt).toBe(SANDBOX_STARTED_AT);
    expect(file.finishedAt).toBe(SANDBOX_FINISHED_AT);
    expect(file.cases.a.order.id).toBe(CASE_A.orderId);
    expect(file.cases.a.order.id.startsWith("2ES4")).toBe(true);
    expect(file.cases.a.order.amount).toBe("20.00");
    expect(file.cases.a.capture?.amount).toBe("20.00");
    expect(file.cases.b.order.id).toBe(GATE1.orderId);
    expect(GATE1.orderId.startsWith("2ES4")).toBe(false);
    expect(file.cases.b.order.amount).toBe("50.00");
    expect(file.cases.b.authorization.id).toBe(GATE1.authorizationId);
    expect(file.cases.b.capture?.id).toBe(GATE1.captureId);
    expect(file.cases.b.capture?.amount).toBe("12.50");
    expect(file.gates.gate1.passed).toBe(true);
    expect(file.cases.c.authorization.id).toBe(CASE_C.authorizationId);
    expect(file.cases.c.captureAfterVoid?.issue).toBe("AUTHORIZATION_VOIDED");
    expect(file.cases.c.captureAfterVoid?.httpStatus).toBe(422);
    expect(file.cases.d.refund?.id).toBe(CASE_D.refundId);
    expect(file.gates.gate2.merchantInitiated.order.id).toBe(GATE2.orderId);
    expect(file.gates.gate2.merchantInitiated.capture.amount).toBe("25.00");
    expect(file.gates.gate2.paymentToken.id).toBe(GATE2.paymentTokenId);
    expect(file.gates.gate2.paymentToken.card_brand).toBe("VISA");
    expect(REPLAY_EVENTS.map((event) => event.id)).toEqual(["start", "a", "gate1", "c", "d", "gate2", "end"]);
    expect(REPLAY_EVENTS.filter((event) => event.at !== null).map((event) => event.at)).toEqual([SANDBOX_STARTED_AT, SANDBOX_FINISHED_AT]);
    expect(tickerLine()).toContain("order 68V137364A632645V");
    expect(tickerLine()).not.toContain("2ES4");
    expect(tickerLine()).toContain("13,893 settled");
    expect(tickerLine()).toContain("1,826 broken");
  });

  it("counts the frozen export with the same disjoint buckets as the eval", () => {
    const { rows } = loadFrozenExport();
    const mix = measureMix(rows);
    const settled = rows.filter((row) => row.status === "settled").length;
    expect(settled).toBe(FROZEN_EXPORT.settled);
    expect(mix.paid_4xx).toBe(FROZEN_EXPORT.paid4xx);
    expect(mix.paid_5xx).toBe(FROZEN_EXPORT.paid5xx);
    expect(mix.shape).toBe(FROZEN_EXPORT.shape);
    expect(mix.late).toBe(FROZEN_EXPORT.late);
    expect(mix.paid_4xx + mix.paid_5xx + mix.shape + mix.late).toBe(FROZEN_EXPORT.broken);
  });
});

import { describe, expect, it } from "vitest";
import { buildCases, OFF_TOPIC_NAMES } from "../eval/cases.js";
import { HELD_OUT_NAMES } from "../eval/held-out-names.js";
import { COMPANY_RECORDS } from "../eval/condition.js";
import { allocate, type CaseType } from "../eval/mix.js";
import { runEval } from "../eval/run.js";
import { fixCondition } from "../src/verify/condition.js";
import { ruleFailure } from "../src/verify/score.js";

describe("eval", () => {
  it("allocation keeps the total and the minimum", () => {
    const a = allocate({ x: 4206, y: 741, z: 121 }, 100, 6);
    expect(Object.values(a).reduce((s, v) => s + v, 0)).toBe(100);
    expect(Math.min(...Object.values(a))).toBeGreaterThanOrEqual(6);
  });

  it("runs ≥100 cases through the full path with zero false approvals", async () => {
    const r = await runEval();
    expect(r.total).toBeGreaterThanOrEqual(100);
    expect(r.falseApprovals).toBe(0);
    expect(r.injectionFlips).toBe(0);
    expect(r.byType.instruction_in_field?.n).toBeGreaterThan(0);
    expect(r.byType.instruction_in_field?.capture).toBe(0);
    expect(r.byType.wrong_content?.n).toBeGreaterThan(0);
    expect(r.byType.wrong_content?.capture).toBe(0);
    expect(r.byType.wrong_content?.void).toBe(r.byType.wrong_content?.n);
    expect(r.chainOk).toBe(true);
    expect(r.railCaptures).toBe(r.byType.honest!.capture);
  }, 60_000);

  it("keeps the held-out names off the list that picked the 12", () => {
    const blocked = new Set<string>(OFF_TOPIC_NAMES);
    const companies = HELD_OUT_NAMES.filter((row) => row.truth === "company");
    const others = HELD_OUT_NAMES.filter((row) => row.truth === "not_company");
    expect(companies).toHaveLength(30);
    expect(others).toHaveLength(30);
    for (const row of HELD_OUT_NAMES) expect(blocked.has(row.text)).toBe(false);
    expect(HELD_OUT_NAMES.filter((row) => row.leftOutOfList).map((row) => row.text)).toEqual([
      "Monday Forecast",
      "Miso Ramen",
      "Wireless Mouse",
    ]);
  });

  it("wrong-content deliveries match the shape and the ranges", () => {
    const zeros = Object.fromEntries(
      (["honest", "shape", "paid_4xx", "paid_5xx", "late", "empty_200", "injection", "instruction_in_field", "wrong_content"] as CaseType[]).map((type) => [type, 0]),
    ) as Record<CaseType, number>;
    const cond = fixCondition(COMPANY_RECORDS);
    for (const item of buildCases({ ...zeros, wrong_content: 12 })) {
      expect(ruleFailure(cond.spec, JSON.parse(item.delivery.body) as unknown)).toBeNull();
    }
  });
});

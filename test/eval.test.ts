import { describe, expect, it } from "vitest";
import { runEval } from "../eval/run.js";
import { allocate } from "../eval/mix.js";

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
    expect(r.chainOk).toBe(true);
    expect(r.railCaptures).toBe(r.byType.honest!.capture);
  }, 60_000);
});

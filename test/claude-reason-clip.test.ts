import { describe, expect, it, vi } from "vitest";
import { COMPANY_RECORDS } from "../eval/condition.js";
import { fixCondition } from "../src/verify/condition.js";
import { claudeDetailFor } from "../src/verify/score.js";
import { goodRecords } from "./helpers.js";

const cond = fixCondition(COMPANY_RECORDS);

describe("Claude score reason", () => {
  it("keeps the score and clips a reason longer than 160 characters", async () => {
    const reason = "x".repeat(161);
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "report_score", input: { score: 0.91, reason } }],
        }),
        { status: 200 },
      ),
    );
    const detail = await claudeDetailFor(cond, "sk-ant-test-secret-value", fetchImpl as unknown as typeof fetch)({
      conditionDescription: cond.spec.description,
      data: { records: goodRecords },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(detail.score).toBe(0.91);
    expect(detail.reason).toBe(reason.slice(0, 160));
    expect(detail.reason.length).toBe(160);
  });
});

import { describe, expect, it } from "vitest";
import { presentReason, reasonSentence } from "../src/i18n/copy.js";
import { holdViews } from "../src/review/holds.js";
import type { ReviewRow } from "../src/server/desk.js";

function row(reason: string): ReviewRow {
  return {
    jobId: "sample-late",
    itemId: "batch-1",
    sellerId: "seller.eval",
    holdCents: 2_500,
    hold: "$25.00",
    reason,
    conditionId: "cond",
    kind: "sample",
    decision: "open",
    waitingMs: 1_000,
  };
}

describe("person grid reason", () => {
  it("reads a late hold as a sentence", () => {
    const [hold] = holdViews([row("late")]);
    expect(reasonSentence("en", hold!.reason)).toBe("The reply was later than the condition allows.");
    expect(reasonSentence("ja", hold!.reason)).toBe("返答が、条件の許す時間より遅かったです。");
    expect(presentReason("en", hold!.reason)).toBe("The reply was later than the condition allows.");
    expect(presentReason("ja", hold!.reason)).toBe("返答が、条件の許す時間より遅かったです。");
  });
});

import { describe, expect, it } from "vitest";
import { activitySentence } from "../src/i18n/copy.js";
import { holdViews, waitingLabel } from "../src/review/holds.js";
import { createApp } from "../src/server/app.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import type { ReviewRow } from "../src/server/desk.js";
import { T0 } from "./helpers.js";

function app() {
  return createApp({ rail: new MockPayPalRail({ now: () => T0 }), now: () => T0 });
}

async function post(a: ReturnType<typeof app>, path: string, body?: unknown) {
  const res = await a.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? "{}" : JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

async function get(a: ReturnType<typeof app>, path: string) {
  const res = await a.request(path);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

function lateRow(itemId: string, jobId = "job_late"): ReviewRow {
  return {
    jobId,
    itemId,
    sellerId: "router.mudko.com/api/x402/route",
    holdCents: 100,
    hold: "$1.00",
    reason: "late",
    conditionId: "cond_test",
    kind: "live",
    decision: "open",
    waitingMs: 12_000,
  };
}

describe("one row per hold", () => {
  it("collapses fifty late rows of one hold and keeps the wait", () => {
    const rows = Array.from({ length: 50 }, (_, i) => lateRow(`rec-${i + 1}`));
    rows.push({ ...lateRow("batch-1", "sample-score"), kind: "sample", reason: "score_uncertain", holdCents: 2_500, waitingMs: 4_000 });
    const holds = holdViews(rows);
    const late = holds.find((hold) => hold.jobId === "job_late");
    expect(late).toBeTruthy();
    expect(holds.filter((hold) => hold.jobId === "job_late")).toHaveLength(1);
    expect(late!.count).toBe(50);
    expect(late!.holdCents).toBe(5_000);
    expect(late!.reason).toBe("late");
    expect(late!.openItemIds).toHaveLength(50);
    expect(waitingLabel(late!.waitingMs)).toBe("12 s");
    expect(holds).toHaveLength(2);
  });

  it("captures every open row of one hold and activity says PayPal captured", async () => {
    const a = app();
    const planned = await post(a, "/api/jobs", { brief: "Collect company records", budgetCents: 5_000, autonomy: "careful" });
    const jobId = planned.json.jobId as string;
    await post(a, `/api/jobs/${jobId}/approve`);
    await post(a, `/api/jobs/${jobId}/settle`, { mode: "unsure" });
    const review = await get(a, "/api/review");
    const rows = review.json.rows as ReviewRow[];
    const live = rows.filter((row) => row.jobId === jobId && row.kind === "live");
    expect(live.length).toBeGreaterThan(1);
    const hold = holdViews(rows).find((group) => group.jobId === jobId);
    expect(hold?.count).toBe(live.length);
    expect(holdViews(rows).filter((group) => group.jobId === jobId)).toHaveLength(1);

    const decided = await post(a, `/api/review/${jobId}`, { decision: "capture" });
    expect(decided.status).toBe(200);
    const act = await get(a, "/api/activity");
    const entries = act.json.entries as { type: string; verdict: string | null }[];
    const lines = entries.map((entry) => activitySentence("en", entry.type, { replay: true, verdict: entry.verdict }));
    expect(lines.some((line) => line.startsWith("PayPal captured"))).toBe(true);
  });
});

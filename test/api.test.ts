import { describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import { approvalSentence, pickSeller, aggregateSellers, loadFrozenExport } from "../src/sellers/index.js";
import { T0 } from "./helpers.js";

const BUDGET = 5_000;

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

const brief = { brief: "Collect company records", budgetCents: BUDGET, autonomy: "careful" };

describe("job API, no network", () => {
  it("plans a hold without calling PayPal, then an honest delivery is captured", async () => {
    const a = app();
    const planned = await post(a, "/api/jobs", brief);
    expect(planned.status).toBe(200);
    const seller = pickSeller(aggregateSellers(loadFrozenExport().rows));
    expect(planned.json.sellerLine).toBe(approvalSentence(seller));
    expect(planned.json.sellerLine).toMatch(/^\d+ paid purchases, \d+\.\d% matched the promised shape, \d+\.\d% errors after payment$/);
    expect(planned.json.conditionId).toMatch(/^cond_[0-9a-f]{64}$/);
    expect(planned.json.holdQuestion).toBe("May I place a hold of $50.00 until each delivery checks out?");
    expect(planned.json.status).toBe("planned");
    expect(planned.json.orderId).toBeNull();

    const quiet = await get(a, "/api/activity");
    const entries = quiet.json.entries as { type: string }[];
    expect(entries.some((e) => e.type === "authorize")).toBe(false);

    const jobId = planned.json.jobId as string;
    const held = await post(a, `/api/jobs/${jobId}/approve`, { approver: "buyer" });
    expect(held.status).toBe(200);
    expect(held.json.status).toBe("authorized");
    expect(held.json.orderId).toMatch(/^ORDER-MOCK-/);
    expect(held.json.authorizationId).toMatch(/^AUTH-MOCK-/);

    const done = await post(a, `/api/jobs/${jobId}/settle`, { mode: "honest" });
    expect(done.json.status).toBe("captured");
    expect(done.json.summary).toBe("Captured $50.00 of $50.00 hold. $0.00 released.");
    expect(done.json.captureId).toMatch(/^CAP-MOCK-/);
    const items = done.json.items as { progress: string }[];
    expect(items.every((i) => i.progress === "PASS → captured")).toBe(true);

    const act = await get(a, "/api/activity");
    const rows = act.json.entries as { type: string; orderId: string | null; authorizationId: string | null; captureId: string | null; hash: string }[];
    expect(rows.some((e) => e.type === "authorize" && e.orderId && e.authorizationId && e.hash.length === 64)).toBe(true);
    expect(rows.some((e) => e.type === "capture" && e.captureId)).toBe(true);
  });

  it("an empty delivery is voided and the buyer loses nothing", async () => {
    const a = app();
    const planned = await post(a, "/api/jobs", { ...brief, autonomy: "autopilot" });
    const jobId = planned.json.jobId as string;
    await post(a, `/api/jobs/${jobId}/approve`);
    const done = await post(a, `/api/jobs/${jobId}/settle`, { mode: "empty" });
    expect(done.json.status).toBe("voided");
    expect(done.json.summary).toBe("$0. Your agent didn't lose a cent.");
    expect(done.json.captureId).toBeNull();
    const items = done.json.items as { progress: string }[];
    expect(items.every((i) => i.progress === "FAIL → voided")).toBe(true);
  });

  it("an unsure delivery goes to a person", async () => {
    const a = app();
    const planned = await post(a, "/api/jobs", brief);
    const jobId = planned.json.jobId as string;
    await post(a, `/api/jobs/${jobId}/approve`);
    const done = await post(a, `/api/jobs/${jobId}/settle`, { mode: "unsure" });
    expect(done.json.status).toBe("needs_human");
    const items = done.json.items as { progress: string }[];
    expect(items.every((i) => i.progress === "UNSURE → human")).toBe(true);
    const review = await get(a, "/api/review");
    const rows = review.json.rows as { jobId: string; kind: string }[];
    expect(rows.some((r) => r.jobId === jobId && r.kind === "live")).toBe(true);
  });

  it("emergency stop voids every open authorization", async () => {
    const a = app();
    const open = await post(a, "/api/jobs", brief);
    const unsure = await post(a, "/api/jobs", { ...brief, brief: "Collect company records, second batch" });
    const openId = open.json.jobId as string;
    const unsureId = unsure.json.jobId as string;
    await post(a, `/api/jobs/${openId}/approve`);
    await post(a, `/api/jobs/${unsureId}/approve`);
    await post(a, `/api/jobs/${unsureId}/settle`, { mode: "unsure" });

    const stop = await post(a, "/api/stop", { reason: "owner pressed stop" });
    expect(stop.status).toBe(200);
    expect(stop.json.voided).toEqual(expect.arrayContaining([openId, unsureId]));

    const left = await get(a, `/api/jobs/${openId}`);
    const right = await get(a, `/api/jobs/${unsureId}`);
    expect(left.json.status).toBe("voided");
    expect(right.json.status).toBe("voided");
    expect(left.json.summary).toBe("$0. Your agent didn't lose a cent.");

    const again = await post(a, "/api/jobs", brief);
    const refused = await post(a, `/api/jobs/${again.json.jobId as string}/approve`);
    expect(refused.status).toBe(409);
    expect(refused.json.orderId).toBeUndefined();
  });

  it("plays the same job both ways: honest captured, empty voided", async () => {
    const a = app();
    const demo = await post(a, "/api/demo", { budgetCents: BUDGET });
    expect(demo.status).toBe(200);
    const left = demo.json.left as { status: string; summary: string; sellerLine: string; conditionId: string };
    const right = demo.json.right as { status: string; summary: string; sellerLine: string; conditionId: string };
    expect(left.status).toBe("captured");
    expect(left.summary).toBe("Captured $50.00 of $50.00 hold. $0.00 released.");
    expect(right.status).toBe("voided");
    expect(right.summary).toBe("$0. Your agent didn't lose a cent.");
    expect(left.sellerLine).toBe(right.sellerLine);
    expect(left.conditionId).toBe(right.conditionId);
  });

  it("resets the sample review rows", async () => {
    const a = app();
    const before = await get(a, "/api/review");
    const rows = before.json.rows as { jobId: string; itemId: string; kind: string; decision: string }[];
    const sample = rows.find((r) => r.kind === "sample");
    expect(sample).toBeTruthy();
    expect(sample!.decision).toBe("open");
    const decided = await post(a, `/api/review/${sample!.jobId}/${sample!.itemId}`, { decision: "void" });
    expect(decided.status).toBe(200);
    const mid = await get(a, "/api/review");
    const midRows = mid.json.rows as { jobId: string; decision: string }[];
    expect(midRows.find((r) => r.jobId === sample!.jobId)!.decision).toBe("void");
    const reset = await post(a, "/api/review/reset");
    expect(reset.status).toBe(200);
    const after = await get(a, "/api/review");
    const afterRows = after.json.rows as { jobId: string; decision: string; kind: string }[];
    expect(afterRows.find((r) => r.jobId === sample!.jobId)!.decision).toBe("open");
    expect(afterRows.filter((r) => r.kind === "sample")).toHaveLength(rows.filter((r) => r.kind === "sample").length);
  });
});

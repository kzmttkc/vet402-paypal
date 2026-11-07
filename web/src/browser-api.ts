import type { Autonomy } from "../../src/policy/mandate.js";
import type { Scorer } from "../../src/verify/judge.js";
import { createDemoDesk } from "../../src/demo/browser-desk.js";
import { Desk, DeskError } from "../../src/server/desk.js";
import type { DeliveryMode } from "../../src/server/deliveries.js";
import type { Transport } from "./transport.js";

const AUTONOMY: readonly Autonomy[] = ["careful", "balanced", "autopilot"];
const MODES: readonly DeliveryMode[] = ["honest", "empty", "unsure"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(message: string): never {
  throw new Error(message);
}

async function dispatch(desk: Desk, path: string, body: unknown): Promise<unknown> {
  if (path === "/api/health") return { ok: true, rail: desk.railName, stopped: desk.isStopped };
  if (path === "/api/review" && body === undefined) return desk.review();
  if (path === "/api/activity" && body === undefined) return desk.activity();
  if (path === "/api/jobs" && body !== undefined) {
    if (!isRecord(body)) return fail("Send a JSON object with brief, budgetCents, and autonomy.");
    if (typeof body.brief !== "string" || body.brief.trim().length === 0 || body.brief.trim().length > 280) {
      return fail("Describe the job in 1–280 characters.");
    }
    if (typeof body.budgetCents !== "number" || !Number.isInteger(body.budgetCents) || body.budgetCents < 2_000 || body.budgetCents > 20_000) {
      return fail("The budget must be between $20.00 and $200.00.");
    }
    if (typeof body.autonomy !== "string" || !AUTONOMY.includes(body.autonomy as Autonomy)) {
      return fail("Autonomy must be careful, balanced, or autopilot.");
    }
    return desk.plan({ brief: body.brief.trim(), budgetCents: body.budgetCents, autonomy: body.autonomy as Autonomy });
  }

  const approve = /^\/api\/jobs\/([^/]+)\/approve$/.exec(path);
  if (approve && body !== undefined) {
    const approver = isRecord(body) && typeof body.approver === "string" && body.approver.trim().length > 0 && body.approver.length <= 80
      ? body.approver.trim()
      : "buyer";
    return desk.approve(decodeURIComponent(approve[1] ?? ""), approver);
  }

  const settle = /^\/api\/jobs\/([^/]+)\/settle$/.exec(path);
  if (settle && body !== undefined) {
    if (!isRecord(body) || typeof body.mode !== "string" || !MODES.includes(body.mode as DeliveryMode)) {
      return fail("mode must be honest, empty, or unsure");
    }
    return desk.settle(decodeURIComponent(settle[1] ?? ""), body.mode as DeliveryMode);
  }

  const one = /^\/api\/jobs\/([^/]+)$/.exec(path);
  if (one && body === undefined) return desk.job(decodeURIComponent(one[1] ?? ""));

  if (path === "/api/pay-per-truth" && body !== undefined) return desk.payPerTruth();

  if (path === "/api/demo" && body !== undefined) {
    const budget = isRecord(body) && body.budgetCents !== undefined ? body.budgetCents : 5_000;
    if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 2_000 || budget > 20_000) {
      return fail("The budget must be between $20.00 and $200.00.");
    }
    return desk.playBoth(budget);
  }

  if (path === "/api/stop" && body !== undefined) {
    const reason = isRecord(body) && typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 120)
      : "owner pressed stop";
    const voided = await desk.emergencyStop(reason);
    return { voided, stopped: true };
  }

  if (path === "/api/review/reset" && body !== undefined) return { rows: desk.resetSamples() };

  const review = /^\/api\/review\/([^/]+)\/([^/]+)$/.exec(path);
  if (review && body !== undefined) {
    if (!isRecord(body) || (body.decision !== "capture" && body.decision !== "void")) {
      return fail("decision must be capture or void");
    }
    const rows = await desk.decide(decodeURIComponent(review[1] ?? ""), decodeURIComponent(review[2] ?? ""), body.decision);
    return { rows };
  }

  return fail("The request failed.");
}

/** One in-memory desk for the whole page. The same routes the server speaks. */
export function createBrowserTransport(scorer?: Scorer): Transport {
  const desk = createDemoDesk(undefined, scorer);
  return async <T>(path: string, body?: unknown): Promise<T> => {
    try {
      return (await dispatch(desk, path, body)) as T;
    } catch (error) {
      if (error instanceof DeskError) throw new Error(error.message);
      throw error;
    }
  };
}

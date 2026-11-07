import { Hono } from "hono";
import { railFromEnv } from "../rail/select.js";
import type { PayPalRail } from "../rail/types.js";
import type { Autonomy } from "../policy/mandate.js";
import { Desk, DeskError, type JobView } from "./desk.js";
import type { DeliveryMode } from "./deliveries.js";

export interface AppOptions {
  rail?: PayPalRail;
  now?: () => number;
}

const AUTONOMY: readonly Autonomy[] = ["careful", "balanced", "autopilot"];
const MODES: readonly DeliveryMode[] = ["honest", "empty", "unsure"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

function parsePlan(body: unknown): { brief: string; budgetCents: number; autonomy: Autonomy } | string {
  if (!isRecord(body)) return "Send a JSON object with brief, budgetCents, and autonomy.";
  if (typeof body.brief !== "string" || body.brief.trim().length === 0 || body.brief.trim().length > 280) {
    return "Describe the job in 1–280 characters.";
  }
  if (typeof body.budgetCents !== "number" || !Number.isInteger(body.budgetCents) || body.budgetCents < 2_000 || body.budgetCents > 20_000) {
    return "The budget must be between $20.00 and $200.00.";
  }
  if (typeof body.autonomy !== "string" || !AUTONOMY.includes(body.autonomy as Autonomy)) {
    return "Autonomy must be careful, balanced, or autopilot.";
  }
  return { brief: body.brief.trim(), budgetCents: body.budgetCents, autonomy: body.autonomy as Autonomy };
}

export function createApp(opts: AppOptions = {}): Hono {
  const desk = new Desk({ rail: opts.rail ?? railFromEnv(), now: opts.now });
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof DeskError) return c.json({ error: err.message }, err.status as 400);
    console.error(err instanceof Error ? err.name : "error");
    return c.json({ error: "something went wrong" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, rail: desk.railName, stopped: desk.isStopped }));

  app.post("/api/jobs", async (c) => {
    const parsed = parsePlan(await readJson(c));
    if (typeof parsed === "string") return c.json({ error: parsed }, 400);
    return c.json(desk.plan(parsed));
  });

  app.get("/api/jobs/:jobId", (c) => c.json(desk.job(c.req.param("jobId"))));

  app.post("/api/jobs/:jobId/approve", async (c) => {
    const body = await readJson(c);
    const approver = isRecord(body) && typeof body.approver === "string" && body.approver.trim().length > 0 && body.approver.length <= 80
      ? body.approver.trim()
      : "buyer";
    return c.json(await desk.approve(c.req.param("jobId"), approver));
  });

  app.post("/api/jobs/:jobId/settle", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body) || typeof body.mode !== "string" || !MODES.includes(body.mode as DeliveryMode)) {
      return c.json({ error: "mode must be honest, empty, or unsure" }, 400);
    }
    return c.json(await desk.settle(c.req.param("jobId"), body.mode as DeliveryMode));
  });

  app.post("/api/demo", async (c) => {
    const body = await readJson(c);
    const budget = isRecord(body) && body.budgetCents !== undefined ? body.budgetCents : 5_000;
    if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 2_000 || budget > 20_000) {
      return c.json({ error: "The budget must be between $20.00 and $200.00." }, 400);
    }
    const played = await desk.playBoth(budget);
    return c.json(played satisfies { left: JobView; right: JobView });
  });

  app.post("/api/stop", async (c) => {
    const body = await readJson(c);
    const reason = isRecord(body) && typeof body.reason === "string" && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 120)
      : "owner pressed stop";
    const voided = await desk.emergencyStop(reason);
    return c.json({ voided, stopped: true });
  });

  app.get("/api/review", (c) => c.json(desk.review()));

  app.post("/api/review/reset", (c) => c.json({ rows: desk.resetSamples() }));

  app.post("/api/review/:jobId/:itemId", async (c) => {
    const body = await readJson(c);
    if (!isRecord(body) || (body.decision !== "capture" && body.decision !== "void")) {
      return c.json({ error: "decision must be capture or void" }, 400);
    }
    const rows = await desk.decide(c.req.param("jobId"), c.req.param("itemId"), body.decision);
    return c.json({ rows });
  });

  app.get("/api/activity", (c) => c.json(desk.activity()));

  return app;
}

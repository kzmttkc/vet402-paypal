import { randomUUID } from "node:crypto";
import { COMPANY_RECORDS } from "../../eval/condition.js";
import { PaymentEngine } from "../engine/index.js";
import { Ledger } from "../ledger/index.js";
import { planJob, type PlanItem } from "../plan/job.js";
import { formatUsd } from "../policy/money.js";
import { PolicyStore } from "../policy/mandate.js";
import { MockPayPalRail } from "../rail/mock.js";
import { railFromEnv, type RailEnv } from "../rail/select.js";
import type { PayPalRail } from "../rail/types.js";
import { ConditionRegistry } from "../verify/condition.js";
import { judge, type Delivery } from "../verify/judge.js";

const DAY = 86_400_000;
const SELLER = "seller.mcp";

interface Planned {
  jobId: string;
  brief: string;
  budgetCents: number;
  items: PlanItem[];
  engine: PaymentEngine | null;
}

function idsOf(data: { [k: string]: unknown }): { orderId: string | null; authorizationId: string | null; captureId: string | null } {
  const str = (k: string) => (typeof data[k] === "string" ? data[k] : null);
  return { orderId: str("orderId"), authorizationId: str("authorizationId"), captureId: str("captureId") };
}

/**
 * One MCP process. PAYPAL_ENV=sandbox selects the PayPal sandbox rail.
 * Any other value keeps the in-memory mock. Holds are not placed and deliveries
 * are not settled unless the caller passes confirm: true.
 */
export class PaypalSession {
  private readonly rail: PayPalRail;
  readonly railName: string;
  private readonly conditions = new ConditionRegistry();
  private readonly conditionId: string;
  private readonly jobs = new Map<string, Planned>();
  private stopped = false;
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now(), env: RailEnv = process.env) {
    this.now = now;
    const mode = (env.PAYPAL_ENV ?? "").trim().toLowerCase();
    this.rail = mode === "sandbox" ? railFromEnv(env) : new MockPayPalRail({ now: () => this.now() });
    this.railName = this.rail.name;
    this.conditionId = this.conditions.register(COMPANY_RECORDS);
  }

  async plan(brief: string, budgetCents: number): Promise<Record<string, unknown>> {
    const plan = await planJob(brief, budgetCents, { env: process.env });
    const jobId = `job_${randomUUID()}`;
    this.jobs.set(jobId, { jobId, brief: brief.trim(), budgetCents: plan.totalCents, items: plan.items, engine: null });
    return { jobId, executed: false, ...plan };
  }

  async placeHold(jobId: string, confirm: boolean | undefined): Promise<Record<string, unknown>> {
    const job = this.must(jobId);
    if (job.engine) {
      const snap = job.engine.job(jobId);
      return { executed: true, jobId, status: snap?.status ?? "authorized", already: true };
    }
    if (confirm !== true) {
      return {
        executed: false,
        needsConfirm: true,
        jobId,
        holdCents: job.budgetCents,
        question: `May I place a hold of ${formatUsd(job.budgetCents)} until each delivery checks out?`,
      };
    }
    if (this.stopped) return { executed: false, jobId, error: "emergency stop is on" };
    const engine = new PaymentEngine({
      rail: this.rail,
      conditions: this.conditions,
      now: this.now,
      ledger: new Ledger(this.now),
      policy: new PolicyStore({
        id: jobId,
        budgetCents: job.budgetCents,
        allowedSellers: [SELLER],
        expiresAt: this.now() + 7 * DAY,
        revoked: false,
        autonomy: "autopilot",
        autoApproveMaxCents: job.budgetCents,
        dailyCapCents: job.budgetCents,
        monthlyCapCents: job.budgetCents,
      }),
    });
    job.engine = engine;
    let result = await engine.requestJob({
      jobId,
      sellerId: SELLER,
      conditionId: this.conditionId,
      items: job.items.map((item) => ({ itemId: item.itemId, priceCents: item.priceCents })),
    });
    if (result.status === "pending_human") result = await engine.approveJob(jobId, "buyer");
    const snap = engine.job(jobId);
    return {
      executed: result.status === "authorized",
      jobId,
      status: result.status,
      orderId: snap?.orderId ?? null,
      authorizationId: snap?.authorizationId ?? null,
      reasons: result.reasons,
    };
  }

  async checkDelivery(input: { body: string; httpStatus?: number; latencyMs?: number }): Promise<Record<string, unknown>> {
    const verdict = await judge(this.conditions.get(this.conditionId), {
      httpStatus: input.httpStatus ?? 200,
      body: input.body,
      latencyMs: input.latencyMs ?? 800,
    });
    return { outcome: verdict.outcome, reason: verdict.reason, score: verdict.score, conditionId: verdict.conditionId };
  }

  async settle(jobId: string, confirm: boolean | undefined, delivery: Delivery): Promise<Record<string, unknown>> {
    const job = this.must(jobId);
    if (confirm !== true) return { executed: false, needsConfirm: true, jobId };
    if (!job.engine) return { executed: false, jobId, error: "place the hold first" };
    if (this.stopped) return { executed: false, jobId, error: "emergency stop is on" };
    const deliveries: Record<string, Delivery> = {};
    for (const item of job.items) deliveries[item.itemId] = delivery;
    const result = await job.engine.settle(jobId, deliveries);
    return { executed: true, jobId, status: result.status, capturedCents: result.capturedCents, captureId: result.captureId };
  }

  async stop(reason: string): Promise<Record<string, unknown>> {
    this.stopped = true;
    const voided: string[] = [];
    for (const job of this.jobs.values()) {
      if (!job.engine) continue;
      voided.push(...(await job.engine.emergencyStop(reason)));
    }
    return { stopped: true, voided };
  }

  activity(): { entries: Record<string, unknown>[] } {
    const entries: Record<string, unknown>[] = [];
    for (const job of this.jobs.values()) {
      if (!job.engine) continue;
      for (const entry of job.engine.ledger.entries()) {
        entries.push({
          seq: entry.seq,
          ts: entry.ts,
          type: entry.type,
          jobId: entry.jobId,
          hash: entry.hash,
          ...idsOf(entry.data),
        });
      }
    }
    return { entries };
  }

  private must(jobId: string): Planned {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`no such job ${jobId}`);
    return job;
  }
}

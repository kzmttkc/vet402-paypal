import { Ledger, LedgerTamperedError, type JsonValue } from "../ledger/index.js";
import { approvalRoute, canPay, stillValidAtCapture, type DenyReason } from "../policy/rules.js";
import { KillSwitch } from "../policy/killswitch.js";
import { PolicyStore } from "../policy/mandate.js";
import { SpendBook } from "../policy/spend.js";
import { assertPositiveCents, sumCents } from "../policy/money.js";
import { RailError, type Cents, type PayPalRail } from "../rail/types.js";
import type { ConditionRegistry } from "../verify/condition.js";
import { judge, type Delivery, type Outcome, type Scorer } from "../verify/judge.js";

export interface JobItem {
  itemId: string;
  /** Set by code from the plan. Never taken from model output. */
  priceCents: Cents;
}

export interface JobRequest {
  jobId: string;
  sellerId: string;
  items: JobItem[];
  conditionId: string;
}

export type JobStatus = "pending_human" | "authorized" | "needs_human" | "captured" | "voided" | "denied" | "expired";

export interface JobResult {
  jobId: string;
  status: JobStatus;
  reasons: string[];
  capturedCents: Cents;
  captureId: string | null;
}

interface Job {
  req: JobRequest;
  amountCents: Cents;
  status: JobStatus;
  orderId: string | null;
  authorizationId: string | null;
  authExpiresAt: number | null;
  outcomes: Map<string, Outcome>;
  captureId: string | null;
  capturedCents: Cents;
  refunds: number;
  final: JobResult | null;
}

export interface EngineOptions {
  rail: PayPalRail;
  policy: PolicyStore;
  conditions: ConditionRegistry;
  ledger?: Ledger;
  killSwitch?: KillSwitch;
  now?: () => number;
  scorer?: Scorer;
}

/**
 * The only path from an agent to money.
 * request → policy (no rail call when denied) → authorize → judge each delivery →
 * capture the passed sum / void / hand to a person. Every decision is written to the hash-chained ledger.
 */
export class PaymentEngine {
  readonly rail: PayPalRail;
  readonly policy: PolicyStore;
  readonly ledger: Ledger;
  readonly killSwitch: KillSwitch;
  private readonly conditions: ConditionRegistry;
  private readonly now: () => number;
  private readonly scorer: Scorer | undefined;
  private readonly book = new SpendBook();
  private readonly jobs = new Map<string, Job>();

  constructor(o: EngineOptions) {
    this.rail = o.rail;
    this.policy = o.policy;
    this.conditions = o.conditions;
    this.now = o.now ?? (() => Date.now());
    this.ledger = o.ledger ?? new Ledger(this.now);
    this.killSwitch = o.killSwitch ?? new KillSwitch();
    this.scorer = o.scorer;
  }

  job(jobId: string): Readonly<Omit<Job, "outcomes">> & { outcomes: Record<string, Outcome> } | undefined {
    const j = this.jobs.get(jobId);
    return j ? { ...j, outcomes: Object.fromEntries(j.outcomes) } : undefined;
  }

  // ------------------------------------------------------------------ authorize

  async requestJob(req: JobRequest): Promise<JobResult> {
    const existing = this.jobs.get(req.jobId);
    if (existing) return this.result(existing);

    if (!this.conditions.has(req.conditionId)) throw new Error(`condition ${req.conditionId} must be fixed before authorization`);
    if (req.items.length === 0) throw new Error("a job needs at least one item");
    for (const it of req.items) assertPositiveCents(it.priceCents, `price of ${it.itemId}`);
    const amountCents = sumCents(req.items.map((i) => i.priceCents));

    const job: Job = {
      req: structuredClone(req),
      amountCents,
      status: "denied",
      orderId: null,
      authorizationId: null,
      authExpiresAt: null,
      outcomes: new Map(),
      captureId: null,
      capturedCents: 0,
      refunds: 0,
      final: null,
    };
    this.jobs.set(req.jobId, job);

    const base = { sellerId: req.sellerId, amountCents, conditionId: req.conditionId };
    if (this.killSwitch.engaged) return this.deny(job, ["emergency_stop"], "authorize");
    const d = canPay(this.policy.mandate, { sellerId: req.sellerId, amountCents }, this.now(), this.book);
    if (!d.ok) return this.deny(job, d.reasons, "authorize");

    if (approvalRoute(this.policy.mandate, amountCents) === "human") {
      job.status = "pending_human";
      this.ledger.append("human", req.jobId, { stage: "authorize", autonomy: this.policy.mandate.autonomy, ...base });
      return this.result(job);
    }
    this.ledger.append("allow", req.jobId, { by: "policy", autonomy: this.policy.mandate.autonomy, ...base });
    return this.authorize(job);
  }

  /** A person approved a job that the autonomy level held back. Policy is checked again. */
  async approveJob(jobId: string, approver: string): Promise<JobResult> {
    const job = this.mustJob(jobId);
    if (job.status !== "pending_human") return this.result(job);
    if (this.killSwitch.engaged) return this.deny(job, ["emergency_stop"], "authorize");
    const d = canPay(this.policy.mandate, { sellerId: job.req.sellerId, amountCents: job.amountCents }, this.now(), this.book);
    if (!d.ok) return this.deny(job, d.reasons, "authorize");
    this.ledger.append("allow", jobId, { by: "human", approver, amountCents: job.amountCents });
    return this.authorize(job);
  }

  private async authorize(job: Job): Promise<JobResult> {
    const id = job.req.jobId;
    try {
      if (this.killSwitch.engaged) return this.deny(job, ["emergency_stop"], "authorize");
      const order = await this.rail.createOrder(
        { intent: "AUTHORIZE", amountCents: job.amountCents, currency: "USD", payeeId: job.req.sellerId, referenceId: id },
        `${id}:create`,
      );
      job.orderId = order.id;
      if (this.killSwitch.engaged) return this.deny(job, ["emergency_stop"], "authorize");
      const auth = await this.rail.authorize(order.id, `${id}:authorize`);
      job.authorizationId = auth.id;
      job.authExpiresAt = auth.expiresAt;
      job.status = "authorized";
      this.book.hold(id, job.amountCents, this.now());
      this.ledger.append("authorize", id, {
        orderId: order.id,
        authorizationId: auth.id,
        amountCents: job.amountCents,
        expiresAt: auth.expiresAt,
        conditionId: job.req.conditionId,
        sellerId: job.req.sellerId,
      });
      return this.result(job);
    } catch (e) {
      if (e instanceof RailError) return this.deny(job, [e.code], "authorize");
      throw e;
    }
  }

  // ------------------------------------------------------------------ settle

  /** Judge deliveries (by itemId) and finish the job. Calling it again returns the same result. */
  async settle(jobId: string, deliveries: Record<string, Delivery>): Promise<JobResult> {
    const job = this.mustJob(jobId);
    if (job.final) return job.final;
    if (job.status === "voided") return this.refuseCapture(job, "authorization_voided");
    if (job.status !== "authorized" && job.status !== "needs_human") return this.result(job);

    const cond = this.conditions.get(job.req.conditionId);
    const judged: { [k: string]: JsonValue } = {};
    for (const item of job.req.items) {
      if (job.outcomes.has(item.itemId)) continue;
      const d = deliveries[item.itemId];
      if (!d) {
        job.outcomes.set(item.itemId, "void");
        judged[item.itemId] = { outcome: "void", reason: "not_delivered" };
        continue;
      }
      const v = await judge(cond, d, this.scorer);
      job.outcomes.set(item.itemId, v.outcome);
      judged[item.itemId] = { outcome: v.outcome, reason: v.reason, score: v.score };
    }
    const waiting = job.req.items.filter((i) => job.outcomes.get(i.itemId) === "human").map((i) => i.itemId);
    if (waiting.length) {
      job.status = "needs_human";
      this.ledger.append("human", jobId, { stage: "delivery", items: waiting, judged, conditionId: cond.conditionId });
      return this.result(job);
    }
    return this.finish(job, judged);
  }

  /** A person decides an item the judge was unsure about. */
  async resolveHuman(jobId: string, itemId: string, decision: "capture" | "void", reviewer: string): Promise<JobResult> {
    const job = this.mustJob(jobId);
    if (job.status !== "needs_human" || job.outcomes.get(itemId) !== "human") return this.result(job);
    job.outcomes.set(itemId, decision);
    this.ledger.append("human", jobId, { stage: "resolved", itemId, decision, reviewer });
    if (job.req.items.some((i) => job.outcomes.get(i.itemId) === "human")) return this.result(job);
    return this.finish(job, {});
  }

  private async finish(job: Job, judged: { [k: string]: JsonValue }): Promise<JobResult> {
    const passed = job.req.items.filter((i) => job.outcomes.get(i.itemId) === "capture");
    const cents = passed.length ? sumCents(passed.map((i) => i.priceCents)) : 0;
    return cents > 0 ? this.capture(job, cents, passed.map((i) => i.itemId), judged) : this.voidJob(job, "no_item_passed", judged);
  }

  private async capture(job: Job, cents: Cents, items: string[], judged: { [k: string]: JsonValue }): Promise<JobResult> {
    const id = job.req.jobId;
    // 1. The ledger must verify before any money is captured. A broken chain stops everything.
    const chain = this.ledger.verifyChain();
    if (!chain.ok) {
      this.killSwitch.engage("ledger_tampered");
      throw new LedgerTamperedError(chain);
    }
    // 2. Emergency stop, checked right before the rail.
    if (this.killSwitch.engaged) return this.refuseCapture(job, "emergency_stop");
    // 3. Second look at expiry and revocation (first look was at decision time).
    const late: string[] = stillValidAtCapture(this.policy.mandate, this.now());
    if (job.authExpiresAt !== null && this.now() >= job.authExpiresAt) late.push("authorization_expired");
    if (late.length) {
      const r = this.refuseCapture(job, ...late);
      if (late.includes("authorization_expired")) {
        job.status = "expired";
        this.book.release(id);
      } else await this.voidJob(job, late.join(","), {});
      return r;
    }
    try {
      const cap = await this.rail.capture(job.authorizationId!, cents, `${id}:capture`, { finalCapture: true });
      job.status = "captured";
      job.captureId = cap.id;
      job.capturedCents = cap.amountCents;
      this.book.settle(id, cap.amountCents);
      this.ledger.append("capture", id, {
        captureId: cap.id,
        authorizationId: job.authorizationId,
        amountCents: cap.amountCents,
        releasedCents: job.amountCents - cap.amountCents,
        items,
        judged,
      });
      job.final = this.result(job);
      return job.final;
    } catch (e) {
      if (e instanceof RailError) {
        if (e.code === "AUTHORIZATION_EXPIRED") {
          job.status = "expired";
          this.book.release(id);
        }
        return this.refuseCapture(job, e.code);
      }
      throw e;
    }
  }

  private async voidJob(job: Job, reason: string, judged: { [k: string]: JsonValue }): Promise<JobResult> {
    const id = job.req.jobId;
    if (!job.authorizationId) return this.result(job);
    try {
      await this.rail.void(job.authorizationId, `${id}:void`);
    } catch (e) {
      if (!(e instanceof RailError)) throw e;
      this.ledger.append("deny", id, { op: "void", reason: e.code });
      return this.result(job);
    }
    job.status = "voided";
    this.book.release(id);
    this.ledger.append("void", id, { authorizationId: job.authorizationId, amountCents: job.amountCents, reason, judged });
    if (reason !== "emergency_stop") job.final = this.result(job);
    return this.result(job);
  }

  // ------------------------------------------------------------------ refund and stop

  async refund(jobId: string, amountCents: Cents, reason: string): Promise<JobResult> {
    const job = this.mustJob(jobId);
    assertPositiveCents(amountCents, "refund");
    if (job.status !== "captured" || !job.captureId) throw new Error(`job ${jobId} has no capture to refund`);
    job.refunds += 1;
    try {
      const ref = await this.rail.refund(job.captureId, amountCents, `${jobId}:refund:${job.refunds}`);
      this.ledger.append("refund", jobId, { refundId: ref.id, captureId: job.captureId, amountCents, reason });
    } catch (e) {
      if (!(e instanceof RailError)) throw e;
      this.ledger.append("deny", jobId, { op: "refund", reason: e.code, amountCents });
    }
    return this.result(job);
  }

  /** Stop everything: no new authorization or capture, and every open authorization is voided. */
  async emergencyStop(reason: string): Promise<string[]> {
    this.killSwitch.engage(reason);
    this.ledger.append("stop", null, { reason });
    const voided: string[] = [];
    for (const job of this.jobs.values()) {
      if (job.status === "authorized" || job.status === "needs_human") {
        await this.voidJob(job, "emergency_stop", {});
        if ((job.status as JobStatus) === "voided") voided.push(job.req.jobId);
      } else if (job.status === "pending_human") {
        this.deny(job, ["emergency_stop"], "authorize");
      }
    }
    return voided;
  }

  // ------------------------------------------------------------------ helpers

  private deny(job: Job, reasons: readonly (DenyReason | string)[], op: "authorize"): JobResult {
    job.status = "denied";
    this.ledger.append("deny", job.req.jobId, { op, reasons: [...reasons], amountCents: job.amountCents, sellerId: job.req.sellerId });
    job.final = { ...this.result(job), reasons: [...reasons] };
    return job.final;
  }

  private refuseCapture(job: Job, ...reasons: string[]): JobResult {
    this.ledger.append("deny", job.req.jobId, { op: "capture", reasons, authorizationId: job.authorizationId });
    return { ...this.result(job), reasons };
  }

  private mustJob(jobId: string): Job {
    const j = this.jobs.get(jobId);
    if (!j) throw new Error(`unknown job ${jobId}`);
    return j;
  }

  private result(job: Job): JobResult {
    return {
      jobId: job.req.jobId,
      status: job.status,
      reasons: [],
      capturedCents: job.capturedCents,
      captureId: job.captureId,
    };
  }
}

/** Rail choice for the engine: PAYPAL_ENV=sandbox → real PayPal sandbox, otherwise the mock. */
export { railFromEnv, SANDBOX_TEST_CARD } from "../rail/select.js";

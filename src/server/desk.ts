import { randomUUID } from "node:crypto";
import { COMPANY_RECORDS } from "../../eval/condition.js";
import { Ledger, type JsonValue } from "../ledger/index.js";
import { PaymentEngine, type JobStatus } from "../engine/index.js";
import { formatUsd } from "../policy/money.js";
import { PolicyStore, type Autonomy } from "../policy/mandate.js";
import type { PayPalRail } from "../rail/types.js";
import { aggregateSellers, approvalSentence, loadFrozenExport, pickSeller, type SellerStats } from "../sellers/index.js";
import { ConditionRegistry, type ConditionSpec } from "../verify/condition.js";
import { defaultScorerFor, type Outcome, type Scorer } from "../verify/judge.js";
import { isScamKind, judgeScam, scamScorer, type ScamResult, type ScamWin } from "../demo/scam.js";
import { deliveryFor, type DeliveryMode } from "./deliveries.js";
import { settlePayPerTruth, TRUTH_COUNT, TRUTH_HOLD_CENTS, TRUTH_PASSED, type TruthResult } from "../pay/truth.js";

const DAY = 86_400_000;
const BALANCED_AUTO_MAX = 5_000;

export class DeskError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DeskError";
  }
}

export interface PlanItem {
  itemId: string;
  label: string;
  priceCents: number;
  price: string;
  progress: string;
}

export interface JobView {
  jobId: string;
  brief: string;
  autonomy: Autonomy;
  status: JobStatus | "planned";
  sellerId: string;
  sellerLine: string;
  holdCents: number;
  capturedCents: number;
  releasedCents: number;
  holdQuestion: string;
  summary: string;
  orderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  conditionId: string;
  condition: {
    description: string;
    shape: ConditionSpec["fields"];
    ranges: NonNullable<ConditionSpec["ranges"]>;
    formats: NonNullable<ConditionSpec["patterns"]>;
    score: { passAt: number; voidBelow: number };
  };
  items: PlanItem[];
}

export interface ReviewRow {
  jobId: string;
  itemId: string;
  sellerId: string;
  holdCents: number;
  hold: string;
  reason: string;
  conditionId: string;
  kind: "sample" | "live";
  decision: "open" | "capture" | "void";
}

export interface ActivityEntry {
  seq: number;
  ts: number;
  jobId: string | null;
  type: string;
  orderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  refundId: string | null;
  verdict: string | null;
  hash: string;
}

interface Sample {
  jobId: string;
  itemId: string;
  holdCents: number;
  reason: string;
  decision: "open" | "capture" | "void";
}

interface Planned {
  jobId: string;
  brief: string;
  autonomy: Autonomy;
  budgetCents: number;
  items: { itemId: string; label: string; priceCents: number }[];
  engine: PaymentEngine | null;
}

function splitBudget(cents: number): { itemId: string; label: string; priceCents: number }[] {
  const first = Math.floor(cents / 2);
  const second = cents - first;
  return [
    { itemId: "batch-1", label: "First half of the delivery", priceCents: first },
    { itemId: "batch-2", label: "Second half of the delivery", priceCents: second },
  ];
}

function asString(data: { [k: string]: JsonValue }, key: string): string | null {
  const v = data[key];
  return typeof v === "string" ? v : null;
}

function verdictOf(data: { [k: string]: JsonValue }): string | null {
  if (typeof data.decision === "string") return data.decision;
  if (typeof data.reason === "string") return data.reason;
  const judged = data.judged;
  if (!judged || typeof judged !== "object" || Array.isArray(judged)) return null;
  const parts: string[] = [];
  for (const [id, v] of Object.entries(judged)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof v.outcome === "string") parts.push(`${id}:${v.outcome}`);
  }
  return parts.length ? parts.join(", ") : null;
}

function progressOf(outcome: Outcome | undefined): string {
  if (outcome === "capture") return "PASS → captured";
  if (outcome === "void") return "FAIL → voided";
  if (outcome === "human") return "UNSURE → human";
  return "waiting";
}

function summaryOf(status: JobStatus | "planned", hold: number, captured: number): string {
  if (status === "voided") return "$0. Your agent didn't lose a cent.";
  if (status === "captured") {
    return `Captured ${formatUsd(captured)} of ${formatUsd(hold)} hold. ${formatUsd(hold - captured)} released.`;
  }
  if (status === "needs_human") return `Hold of ${formatUsd(hold)} stays open until a person decides.`;
  if (status === "authorized" || status === "pending_human") return `Hold of ${formatUsd(hold)} is open.`;
  if (status === "planned") return "Nothing is held yet.";
  return "This hold did not go through.";
}

/**
 * One screen's worth of jobs. Each job has its own mandate (budget and autonomy).
 * They share one PayPal rail. The stop switch covers every open authorization.
 */
export class Desk {
  readonly railName: string;
  readonly seller: SellerStats;
  readonly conditionId: string;
  private readonly rail: PayPalRail;
  private readonly now: () => number;
  private readonly conditions = new ConditionRegistry();
  private readonly jobs = new Map<string, Planned>();
  private readonly samples: Sample[];
  private stopped = false;

  private readonly scorer: Scorer | undefined;

  private readonly onScamWin: ((win: ScamWin) => void) | undefined;
  private readonly scamWins: ScamWin[] = [];

  constructor(opts: {
    rail: PayPalRail;
    now?: () => number;
    sellers?: ReadonlyMap<string, SellerStats>;
    scorer?: Scorer;
    onScamWin?: (win: ScamWin) => void;
  }) {
    this.rail = opts.rail;
    this.railName = opts.rail.name === "paypal-sandbox" ? "sandbox" : "mock";
    this.now = opts.now ?? (() => Date.now());
    this.scorer = opts.scorer;
    this.onScamWin = opts.onScamWin;
    const sellers = opts.sellers ?? aggregateSellers(loadFrozenExport().rows);
    this.seller = pickSeller(sellers);
    this.conditionId = this.conditions.register(COMPANY_RECORDS);
    this.samples = [
      { jobId: "sample-late", itemId: "batch-1", holdCents: 2_500, reason: "late", decision: "open" },
      { jobId: "sample-score", itemId: "batch-2", holdCents: 2_500, reason: "score_uncertain", decision: "open" },
      { jobId: "sample-scorer", itemId: "batch-1", holdCents: 4_000, reason: "scorer_invalid", decision: "open" },
    ];
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  plan(input: { brief: string; budgetCents: number; autonomy: Autonomy }): JobView {
    const job: Planned = {
      jobId: `job_${randomUUID()}`,
      brief: input.brief,
      autonomy: input.autonomy,
      budgetCents: input.budgetCents,
      items: splitBudget(input.budgetCents),
      engine: null,
    };
    this.jobs.set(job.jobId, job);
    return this.view(job);
  }

  async approve(jobId: string, approver = "buyer"): Promise<JobView> {
    if (this.stopped) throw new DeskError(409, "emergency stop is on; new holds are refused");
    const job = this.must(jobId);
    if (job.engine) return this.view(job);
    const engine = this.openEngine(job);
    job.engine = engine;
    let result = await engine.requestJob({
      jobId: job.jobId,
      sellerId: this.seller.resourceKey,
      conditionId: this.conditionId,
      items: job.items.map((i) => ({ itemId: i.itemId, priceCents: i.priceCents })),
    });
    if (result.status === "pending_human") result = await engine.approveJob(job.jobId, approver);
    if (result.status === "denied") {
      throw new DeskError(409, result.reasons.join(", ") || "refused before PayPal was called");
    }
    return this.view(job);
  }

  async settle(jobId: string, mode: DeliveryMode): Promise<JobView> {
    const job = this.must(jobId);
    if (!job.engine) throw new DeskError(409, "place the hold first");
    const delivery = deliveryFor(mode);
    const deliveries: Record<string, ReturnType<typeof deliveryFor>> = {};
    for (const item of job.items) deliveries[item.itemId] = delivery;
    await job.engine.settle(job.jobId, deliveries);
    return this.view(job);
  }

  /** One fake delivery. A capture is a scam that worked and is kept for the eval. */
  async challenge(kind: string, text = ""): Promise<ScamResult & { wins: ScamWin[] }> {
    if (!isScamKind(kind)) throw new DeskError(400, "kind must be a prepared scam");
    if (this.stopped) throw new DeskError(409, "emergency stop is on; new holds are refused");
    const jobId = `scam_${randomUUID()}`;
    const job: Planned = {
      jobId,
      brief: "Scam my agent",
      autonomy: "autopilot",
      budgetCents: 100,
      items: [{ itemId: "delivery", label: "One delivery", priceCents: 100 }],
      engine: null,
    };
    const base = this.scorer ?? defaultScorerFor(this.conditions.get(this.conditionId));
    const engine = this.openEngine(job, scamScorer(base));
    job.engine = engine;
    this.jobs.set(jobId, job);
    const done = await judgeScam(
      engine,
      this.conditionId,
      kind,
      text,
      (win) => {
        this.scamWins.push(win);
        this.onScamWin?.(win);
      },
      this.seller.resourceKey,
      jobId,
    );
    return { ...done, wins: [...this.scamWins] };
  }

  /** One hold for 50 records. 37 pass. Capture is 37/50 of the hold; the rest is released. */
  async payPerTruth(): Promise<TruthResult> {
    if (this.stopped) throw new DeskError(409, "emergency stop is on; new holds are refused");
    const jobId = `truth_${randomUUID()}`;
    const job: Planned = {
      jobId,
      brief: "50 company records",
      autonomy: "autopilot",
      budgetCents: TRUTH_HOLD_CENTS,
      items: Array.from({ length: TRUTH_COUNT }, (_, i) => ({
        itemId: `rec-${String(i + 1).padStart(2, "0")}`,
        label: `Record ${i + 1}`,
        priceCents: Math.floor(TRUTH_HOLD_CENTS / TRUTH_COUNT),
      })),
      engine: null,
    };
    const engine = this.openEngine(job);
    job.engine = engine;
    this.jobs.set(jobId, job);
    return settlePayPerTruth(engine, this.conditionId, {
      jobId,
      sellerId: this.seller.resourceKey,
      holdCents: TRUTH_HOLD_CENTS,
      count: TRUTH_COUNT,
      passed: TRUTH_PASSED,
    });
  }

  async playBoth(budgetCents: number): Promise<{ left: JobView; right: JobView }> {
    if (this.stopped) throw new DeskError(409, "emergency stop is on; new holds are refused");
    const input = { brief: "Collect company records", budgetCents, autonomy: "autopilot" as const };
    const left = this.plan(input);
    const right = this.plan(input);
    await this.approve(left.jobId);
    await this.approve(right.jobId);
    return { left: await this.settle(left.jobId, "honest"), right: await this.settle(right.jobId, "empty") };
  }

  async emergencyStop(reason = "owner pressed stop"): Promise<string[]> {
    this.stopped = true;
    const voided: string[] = [];
    for (const job of this.jobs.values()) {
      if (!job.engine) continue;
      voided.push(...(await job.engine.emergencyStop(reason)));
    }
    return voided;
  }

  review(): { rows: ReviewRow[] } {
    const samples: ReviewRow[] = this.samples.map((s) => ({
      jobId: s.jobId,
      itemId: s.itemId,
      sellerId: this.seller.resourceKey,
      holdCents: s.holdCents,
      hold: formatUsd(s.holdCents),
      reason: s.reason,
      conditionId: this.conditionId,
      kind: "sample",
      decision: s.decision,
    }));
    return { rows: [...samples, ...this.liveRows()] };
  }

  async decide(jobId: string, itemId: string, decision: "capture" | "void"): Promise<ReviewRow[]> {
    const sample = this.samples.find((s) => s.jobId === jobId && s.itemId === itemId);
    if (sample) {
      sample.decision = decision;
      return this.review().rows;
    }
    const job = this.jobs.get(jobId);
    if (!job?.engine) throw new DeskError(404, "no such review row");
    const outcome = job.engine.job(jobId)?.outcomes[itemId];
    if (outcome !== "human") throw new DeskError(404, "no such review row");
    await job.engine.resolveHuman(jobId, itemId, decision, "buyer");
    return this.review().rows;
  }

  resetSamples(): ReviewRow[] {
    for (const s of this.samples) s.decision = "open";
    return this.review().rows;
  }

  activity(): { entries: ActivityEntry[]; chains: { jobId: string; headHash: string; ok: boolean }[] } {
    const entries: ActivityEntry[] = [];
    const chains: { jobId: string; headHash: string; ok: boolean }[] = [];
    for (const job of this.jobs.values()) {
      if (!job.engine) continue;
      const check = job.engine.ledger.verifyChain();
      chains.push({ jobId: job.jobId, headHash: job.engine.ledger.headHash, ok: check.ok });
      for (const e of job.engine.ledger.entries()) {
        entries.push({
          seq: e.seq,
          ts: e.ts,
          jobId: e.jobId,
          type: e.type,
          orderId: asString(e.data, "orderId"),
          authorizationId: asString(e.data, "authorizationId"),
          captureId: asString(e.data, "captureId"),
          refundId: asString(e.data, "refundId"),
          verdict: verdictOf(e.data),
          hash: e.hash,
        });
      }
    }
    return { entries, chains };
  }

  job(jobId: string): JobView {
    return this.view(this.must(jobId));
  }

  private liveRows(): ReviewRow[] {
    const rows: ReviewRow[] = [];
    for (const job of this.jobs.values()) {
      const snap = job.engine?.job(job.jobId);
      if (!snap || snap.status !== "needs_human") continue;
      const reason = this.reasonFor(job);
      for (const item of job.items) {
        const outcome = snap.outcomes[item.itemId];
        if (outcome !== "human" && outcome !== "capture" && outcome !== "void") continue;
        if (outcome !== "human" && !job.items.some((i) => snap.outcomes[i.itemId] === "human")) continue;
        rows.push({
          jobId: job.jobId,
          itemId: item.itemId,
          sellerId: this.seller.resourceKey,
          holdCents: item.priceCents,
          hold: formatUsd(item.priceCents),
          reason: reason[item.itemId] ?? "unsure",
          conditionId: this.conditionId,
          kind: "live",
          decision: outcome === "human" ? "open" : outcome,
        });
      }
    }
    return rows;
  }

  private reasonFor(job: Planned): Record<string, string> {
    const out: Record<string, string> = {};
    const entry = job.engine?.ledger.ofJob(job.jobId).find((e) => e.type === "human" && e.data.stage === "delivery");
    const judged = entry?.data.judged;
    if (!judged || typeof judged !== "object" || Array.isArray(judged)) return out;
    for (const [id, v] of Object.entries(judged)) {
      if (v && typeof v === "object" && !Array.isArray(v) && typeof v.reason === "string") out[id] = v.reason;
    }
    return out;
  }

  private openEngine(job: Planned, scorer: Scorer | undefined = this.scorer): PaymentEngine {
    return new PaymentEngine({
      rail: this.rail,
      policy: new PolicyStore({
        id: job.jobId,
        budgetCents: job.budgetCents,
        allowedSellers: [this.seller.resourceKey],
        expiresAt: this.now() + 7 * DAY,
        revoked: false,
        autonomy: job.autonomy,
        autoApproveMaxCents: job.autonomy === "balanced" ? BALANCED_AUTO_MAX : 0,
        dailyCapCents: job.budgetCents,
        monthlyCapCents: job.budgetCents,
      }),
      conditions: this.conditions,
      now: this.now,
      ledger: new Ledger(this.now),
      scorer,
    });
  }

  private must(jobId: string): Planned {
    const job = this.jobs.get(jobId);
    if (!job) throw new DeskError(404, "no such job");
    return job;
  }

  private view(job: Planned): JobView {
    const snap = job.engine?.job(job.jobId);
    const status: JobStatus | "planned" = snap?.status ?? "planned";
    const captured = snap?.capturedCents ?? 0;
    const spec = this.conditions.get(this.conditionId).spec;
    return {
      jobId: job.jobId,
      brief: job.brief,
      autonomy: job.autonomy,
      status,
      sellerId: this.seller.resourceKey,
      sellerLine: approvalSentence(this.seller),
      holdCents: job.budgetCents,
      capturedCents: captured,
      releasedCents: status === "captured" ? job.budgetCents - captured : status === "voided" ? job.budgetCents : 0,
      holdQuestion: `May I place a hold of ${formatUsd(job.budgetCents)} until each delivery checks out?`,
      summary: summaryOf(status, job.budgetCents, captured),
      orderId: snap?.orderId ?? null,
      authorizationId: snap?.authorizationId ?? null,
      captureId: snap?.captureId ?? null,
      conditionId: this.conditionId,
      condition: {
        description: spec.description,
        shape: spec.fields,
        ranges: spec.ranges ?? {},
        formats: spec.patterns ?? {},
        score: { passAt: spec.ai.passAt, voidBelow: spec.ai.voidBelow },
      },
      items: job.items.map((item) => ({
        itemId: item.itemId,
        label: item.label,
        priceCents: item.priceCents,
        price: formatUsd(item.priceCents),
        progress: progressOf(snap?.outcomes[item.itemId]),
      })),
    };
  }
}

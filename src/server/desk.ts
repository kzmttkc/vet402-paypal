import { randomUUID } from "node:crypto";
import { COMPANY_RECORDS } from "../../eval/condition.js";
import { Ledger, type JsonValue } from "../ledger/index.js";
import { PaymentEngine, type JobStatus } from "../engine/index.js";
import { formatUsd } from "../policy/money.js";
import { PolicyStore, type Autonomy } from "../policy/mandate.js";
import { RailError, type PayPalRail } from "../rail/types.js";
import { aggregateSellers, approvalSentence, jobKindFromBrief, loadFrozenExport, pickSellerFor, SAMPLE_SELLER_LINE, type SellerStats } from "../sellers/index.js";
import { ConditionRegistry, type ConditionSpec } from "../verify/condition.js";
import { defaultScorerFor, type Outcome, type Scorer } from "../verify/judge.js";
import { warmingScorer } from "../verify/warmup.js";
import { isScamKind, judgeScam, scamScorer, type ScamResult, type ScamWin } from "../demo/scam.js";
import { deliveryFor, type DeliveryMode } from "./deliveries.js";
import { recordPrices, settlePayPerTruth, TRUTH_COUNT, TRUTH_HOLD_CENTS, TRUTH_PASSED, type TruthResult } from "../pay/truth.js";
import { creditPlan, slicesOf, type CreditPlan } from "../sellers/credit.js";

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
  sellerSample: boolean;
  holdCents: number;
  capturedCents: number;
  releasedCents: number;
  holdQuestion: string;
  holdReason: string;
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

interface Line {
  itemId: string;
  label: string;
  priceCents: number;
}

interface Planned {
  jobId: string;
  brief: string;
  autonomy: Autonomy;
  budgetCents: number;
  items: Line[];
  records: { itemId: string; priceCents: number }[];
  seller: SellerStats;
  sellerSample: boolean;
  credit: CreditPlan;
  approver: string;
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
  private readonly sellerSample: boolean;
  readonly conditionId: string;
  private readonly sellers: ReadonlyMap<string, SellerStats>;
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
    this.onScamWin = opts.onScamWin;
    const sellers = opts.sellers ?? aggregateSellers(loadFrozenExport().rows);
    this.sellers = sellers;
    const standing = pickSellerFor(sellers, "company");
    this.seller = standing.seller;
    this.sellerSample = standing.sample;
    this.conditionId = this.conditions.register(COMPANY_RECORDS);
    this.scorer = opts.scorer ?? warmingScorer(this.conditions.get(this.conditionId));
    this.samples = [
      { jobId: "sample-late", itemId: "batch-1", holdCents: 2_500, reason: "late", decision: "open" },
      { jobId: "sample-score", itemId: "batch-2", holdCents: 2_500, reason: "score_uncertain", decision: "open" },
      { jobId: "sample-scorer", itemId: "batch-1", holdCents: 4_000, reason: "scorer_invalid", decision: "open" },
    ];
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  plan(input: { brief: string; budgetCents: number; autonomy: Autonomy; seller?: "established" | "new" }): JobView {
    const choice = pickSellerFor(this.sellers, jobKindFromBrief(input.brief));
    const seller = input.seller === "new" ? this.newSeller() : choice.seller;
    const sellerSample = input.seller === "new" ? false : choice.sample;
    const records = input.seller === "new" ? pricedRecords(input.budgetCents, 25) : splitBudget(input.budgetCents);
    const credit = creditPlan(seller, records.length);
    const items = credit.parts === 1 ? records : partLines(records, credit.partSize);
    const job = this.finishPlan({
      jobId: `job_${randomUUID()}`,
      brief: input.brief,
      autonomy: input.autonomy,
      budgetCents: input.budgetCents,
      items,
      records,
      seller,
      sellerSample,
    });
    this.jobs.set(job.jobId, job);
    return this.view(job);
  }

  /**
   * Open a PayPal order for the button, without authorizing it.
   * Automatic levels that already held the money return `alreadyHeld` and do not open a second order.
   */
  async stagePaypalOrder(jobId: string): Promise<{ orderId: string | null; alreadyHeld: boolean }> {
    if (this.stopped) throw new DeskError(409, "emergency stop is on; new holds are refused");
    const job = this.must(jobId);
    if (job.credit.parts > 1) throw new DeskError(409, "a split hold stays on this page's own approval");
    if (!job.engine) {
      job.engine = this.openEngine(job);
      const result = await job.engine.requestJob({
        jobId: job.jobId,
        sellerId: job.seller.resourceKey,
        conditionId: this.conditionId,
        items: job.items.map((item) => ({ itemId: item.itemId, priceCents: item.priceCents })),
      });
      if (result.status === "denied") {
        throw new DeskError(409, result.reasons.join(", ") || "refused before PayPal was called");
      }
      if (result.status === "authorized") {
        return { orderId: job.engine.job(job.jobId)?.orderId ?? null, alreadyHeld: true };
      }
      if (result.status !== "pending_human") throw new DeskError(409, "this job is not waiting for approval");
    }
    const snap = job.engine.job(job.jobId);
    if (snap?.status === "authorized") return { orderId: snap.orderId, alreadyHeld: true };
    if (snap?.status !== "pending_human") throw new DeskError(409, "this job is not waiting for approval");
    try {
      const orderId = await job.engine.stageBuyerOrder(job.jobId);
      return { orderId, alreadyHeld: false };
    } catch (e) {
      if (e instanceof RailError) throw new DeskError(409, e.code);
      throw e;
    }
  }

  async approve(jobId: string, approver = "buyer", opts?: { buyerApproved?: boolean }): Promise<JobView> {
    if (this.stopped) throw new DeskError(409, "emergency stop is on; new holds are refused");
    const job = this.must(jobId);
    job.approver = approver;
    if (opts?.buyerApproved) {
      if (!job.engine) throw new DeskError(409, "open the PayPal order before approving");
      const result = await job.engine.approveJob(job.jobId, approver, { buyerApproved: true });
      if (result.status === "denied") {
        throw new DeskError(409, result.reasons.join(", ") || "refused before PayPal was called");
      }
      return this.view(job);
    }
    if (job.engine) return this.view(job);
    const engine = this.openEngine(job);
    job.engine = engine;
    if (job.credit.parts > 1) {
      await this.authorizeSlice(job, 0);
      return this.view(job);
    }
    let result = await engine.requestJob({
      jobId: job.jobId,
      sellerId: job.seller.resourceKey,
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
    if (job.credit.parts > 1) {
      for (let i = 0; i < job.credit.parts; i++) {
        const id = `${job.jobId}:${i + 1}`;
        if (!job.engine.job(id)) await this.authorizeSlice(job, i);
        const snap = job.engine.job(id);
        if (!snap || (snap.status !== "authorized" && snap.status !== "needs_human")) continue;
        const slice = slicesOf(job.records, job.credit.partSize)[i] ?? [];
        const deliveries: Record<string, ReturnType<typeof deliveryFor>> = {};
        for (const item of slice) deliveries[item.itemId] = delivery;
        const settled = await job.engine.settle(id, deliveries);
        if (settled.status === "needs_human") break;
      }
      return this.view(job);
    }
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
    const job = this.finishPlan({
      jobId,
      brief: "Scam my agent",
      autonomy: "autopilot",
      budgetCents: 100,
      items: [{ itemId: "delivery", label: "One delivery", priceCents: 100 }],
    });
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
    const job = this.finishPlan({
      jobId,
      brief: "50 company records",
      autonomy: "autopilot",
      budgetCents: TRUTH_HOLD_CENTS,
      items: Array.from({ length: TRUTH_COUNT }, (_, i) => ({
        itemId: `rec-${String(i + 1).padStart(2, "0")}`,
        label: `Record ${i + 1}`,
        priceCents: Math.floor(TRUTH_HOLD_CENTS / TRUTH_COUNT),
      })),
    });
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
        allowedSellers: [job.seller.resourceKey],
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

  private newSeller(): SellerStats {
    const found = [...this.sellers.values()]
      .filter((seller) => seller.settled === 0)
      .sort((a, b) => a.resourceKey.localeCompare(b.resourceKey))[0];
    if (!found) throw new DeskError(409, "the export has no new seller");
    return found;
  }

  private finishPlan(
    job: Omit<Planned, "records" | "seller" | "sellerSample" | "credit" | "approver" | "engine"> & {
      seller?: SellerStats;
      sellerSample?: boolean;
      records?: Planned["records"];
    },
  ): Planned {
    const seller = job.seller ?? this.seller;
    const sellerSample = job.sellerSample ?? this.sellerSample;
    const records = job.records ?? job.items.map((item) => ({ itemId: item.itemId, priceCents: item.priceCents }));
    return { ...job, seller, sellerSample, records, credit: creditPlan(seller, records.length), approver: "buyer", engine: null };
  }

  private async authorizeSlice(job: Planned, index: number): Promise<void> {
    const engine = job.engine;
    if (!engine) throw new DeskError(409, "place the hold first");
    const slice = slicesOf(job.records, job.credit.partSize)[index];
    if (!slice) return;
    const id = `${job.jobId}:${index + 1}`;
    if (engine.job(id)) return;
    let result = await engine.requestJob({
      jobId: id,
      sellerId: job.seller.resourceKey,
      conditionId: this.conditionId,
      items: slice.map((item) => ({ itemId: item.itemId, priceCents: item.priceCents })),
    });
    if (result.status === "pending_human") result = await engine.approveJob(id, job.approver);
    if (result.status === "denied") {
      throw new DeskError(409, result.reasons.join(", ") || "refused before PayPal was called");
    }
  }

  private snaps(job: Planned) {
    if (!job.engine) return [];
    if (job.credit.parts === 1) {
      const one = job.engine.job(job.jobId);
      return one ? [one] : [];
    }
    const out = [];
    for (let i = 0; i < job.credit.parts; i++) {
      const snap = job.engine.job(`${job.jobId}:${i + 1}`);
      if (snap) out.push(snap);
    }
    return out;
  }

  private view(job: Planned): JobView {
    const snaps = this.snaps(job);
    const status = combinedStatus(job, snaps, this.stopped);
    const captured = snaps.reduce((sum, snap) => sum + snap.capturedCents, 0);
    const last = snaps.at(-1);
    const spec = this.conditions.get(this.conditionId).spec;
    const single = snaps[0];
    return {
      jobId: job.jobId,
      brief: job.brief,
      autonomy: job.autonomy,
      status,
      sellerId: job.seller.resourceKey,
      sellerLine: job.sellerSample ? SAMPLE_SELLER_LINE : approvalSentence(job.seller),
      sellerSample: job.sellerSample,
      holdCents: job.budgetCents,
      capturedCents: captured,
      releasedCents: status === "captured" ? job.budgetCents - captured : status === "voided" ? job.budgetCents : 0,
      holdQuestion: `May I place a hold of ${formatUsd(job.budgetCents)} until each delivery checks out?`,
      holdReason: job.credit.reason,
      summary: summaryOf(status, job.budgetCents, captured),
      orderId: last?.orderId ?? null,
      authorizationId: last?.authorizationId ?? null,
      captureId: last?.captureId ?? null,
      conditionId: this.conditionId,
      condition: {
        description: spec.description,
        shape: spec.fields,
        ranges: spec.ranges ?? {},
        formats: spec.patterns ?? {},
        score: { passAt: spec.ai.passAt, voidBelow: spec.ai.voidBelow },
      },
      items: job.items.map((item, index) => ({
        itemId: item.itemId,
        label: item.label,
        priceCents: item.priceCents,
        price: formatUsd(item.priceCents),
        progress: itemProgress(job, item.itemId, index, single),
      })),
    };
  }
}

function pricedRecords(cents: number, count: number): Line[] {
  return recordPrices(cents, count).map((priceCents, i) => ({
    itemId: `rec-${String(i + 1).padStart(2, "0")}`,
    label: `Record ${i + 1}`,
    priceCents,
  }));
}

function partLines(records: { itemId: string; priceCents: number }[], partSize: number): Line[] {
  return slicesOf(records, partSize).map((slice, i) => ({
    itemId: `part-${i + 1}`,
    label: `Part ${i + 1} · ${slice.length} records`,
    priceCents: slice.reduce((sum, item) => sum + item.priceCents, 0),
  }));
}

function combinedStatus(
  job: Planned,
  snaps: { status: JobStatus }[],
  stopped: boolean,
): JobStatus | "planned" {
  if (snaps.length === 0) return "planned";
  if (snaps.some((snap) => snap.status === "needs_human")) return "needs_human";
  if (snaps.some((snap) => snap.status === "pending_human")) return "pending_human";
  if (snaps.some((snap) => snap.status === "authorized")) return "authorized";
  if (snaps.length < job.credit.parts && !stopped) return "authorized";
  if (snaps.some((snap) => snap.status === "captured")) return "captured";
  if (snaps.every((snap) => snap.status === "voided")) return "voided";
  return snaps.at(-1)!.status;
}

function itemProgress(
  job: Planned,
  itemId: string,
  index: number,
  single: { outcomes: Record<string, Outcome>; status: JobStatus } | undefined,
): string {
  if (job.credit.parts === 1) return progressOf(single?.outcomes[itemId]);
  const snap = job.engine?.job(`${job.jobId}:${index + 1}`);
  if (snap?.status === "captured") return "PASS → captured";
  if (snap?.status === "voided") return "FAIL → voided";
  if (snap?.status === "needs_human") return "UNSURE → human";
  return "waiting";
}

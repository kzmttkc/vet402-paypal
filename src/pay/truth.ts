import { PaymentEngine, type JobStatus } from "../engine/index.js";
import { formatUsd, sumCents } from "../policy/money.js";
import type { Cents } from "../rail/types.js";
import type { Delivery } from "../verify/judge.js";

/** One hold, fifty records. The first 37 pass. Amounts are integer cents. */
export const TRUTH_HOLD_CENTS = 5_000;
export const TRUTH_COUNT = 50;
export const TRUTH_PASSED = 37;

const NAMES = [
  "Kizuna Logistics",
  "Northwind Foods",
  "Hanami Robotics",
  "Blue Ridge Energy",
  "Sakura Bio",
  "Atlas Freight",
  "Mizu Water Co.",
  "Orion Analytics",
  "Pine & Oak Ltd.",
  "Kaito Motors",
  "Lumen Health",
  "Tora Steel",
] as const;

export interface TruthRow {
  itemId: string;
  name: string;
  mark: "PASS" | "FAIL";
  capturedCents: number;
  releasedCents: number;
}

export interface TruthResult {
  jobId: string;
  status: JobStatus;
  holdCents: number;
  capturedCents: number;
  releasedCents: number;
  captureId: string | null;
  authorizationId: string | null;
  line: string;
  rows: TruthRow[];
}

/** Split a hold into one integer price per record. The prices sum to the hold. */
export function recordPrices(holdCents: number, count: number): number[] {
  if (!Number.isInteger(holdCents) || holdCents < 1) throw new TypeError("holdCents must be a positive integer of cents");
  if (!Number.isInteger(count) || count < 1) throw new TypeError("count must be a positive integer");
  if (holdCents < count) throw new TypeError("hold is smaller than one cent per record");
  const base = Math.floor(holdCents / count);
  let leftover = holdCents - base * count;
  return Array.from({ length: count }, () => {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    return base + extra;
  });
}

/** Capture for the first `passed` records. The rest of the hold is what final_capture releases. */
export function passedCaptureCents(holdCents: number, count: number, passed: number): Cents {
  if (!Number.isInteger(passed) || passed < 0 || passed > count) throw new TypeError("passed must be an integer from 0 to count");
  return sumCents(recordPrices(holdCents, count).slice(0, passed));
}

export function truthLine(capturedCents: number, holdCents: number): string {
  return `Captured ${formatUsd(capturedCents)} of ${formatUsd(holdCents)}. ${formatUsd(holdCents - capturedCents)} released.`;
}

function recordBody(name: string): Delivery {
  return {
    httpStatus: 200,
    body: JSON.stringify({
      records: [
        {
          name,
          country: "JP",
          employees: 40,
          founded: 1998,
          source_url: "https://registry.example.org/c/1",
        },
      ],
    }),
    latencyMs: 200,
  };
}

/**
 * One authorization for the whole job. Each record is judged. Capture is the sum of the
 * prices of the records that passed, with final_capture so PayPal releases the rest.
 * Zero passes voids the authorization instead of capturing.
 */
export async function settlePayPerTruth(
  engine: PaymentEngine,
  conditionId: string,
  opts: { jobId?: string; sellerId?: string; holdCents?: number; count?: number; passed?: number } = {},
): Promise<TruthResult> {
  const holdCents = opts.holdCents ?? TRUTH_HOLD_CENTS;
  const count = opts.count ?? TRUTH_COUNT;
  const passed = opts.passed ?? TRUTH_PASSED;
  const sellerId = opts.sellerId ?? "seller.good";
  const jobId = opts.jobId ?? "pay-per-truth";
  const prices = recordPrices(holdCents, count);
  const items = prices.map((priceCents, i) => ({
    itemId: `rec-${String(i + 1).padStart(2, "0")}`,
    priceCents,
  }));
  const names = items.map((_, i) => NAMES[i % NAMES.length]!);
  const deliveries: Record<string, Delivery> = {};
  for (let i = 0; i < items.length; i++) {
    deliveries[items[i]!.itemId] = i < passed ? recordBody(names[i]!) : { httpStatus: 200, body: "", latencyMs: 200 };
  }

  let result = await engine.requestJob({ jobId, sellerId, conditionId, items });
  if (result.status === "pending_human") result = await engine.approveJob(jobId, "buyer");
  if (result.status === "authorized") result = await engine.settle(jobId, deliveries);

  let capturedRunning = 0;
  let releasedRunning = 0;
  const rows: TruthRow[] = items.map((item, i) => {
    const mark = i < passed ? "PASS" : "FAIL";
    if (mark === "PASS") capturedRunning += item.priceCents;
    else releasedRunning += item.priceCents;
    return { itemId: item.itemId, name: names[i]!, mark, capturedCents: capturedRunning, releasedCents: releasedRunning };
  });

  const snap = engine.job(jobId);
  const capturedCents = result.capturedCents;
  return {
    jobId,
    status: result.status,
    holdCents,
    capturedCents,
    releasedCents: Math.max(0, holdCents - capturedCents),
    captureId: result.captureId,
    authorizationId: snap?.authorizationId ?? null,
    line: result.status === "voided" ? "$0. Your agent didn't lose a cent." : truthLine(capturedCents, holdCents),
    rows,
  };
}

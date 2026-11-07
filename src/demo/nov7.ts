/**
 * Facts for the 2026-11-07 screens.
 *
 * The $50.00 hold that captured $12.50 is order 68V137364A632645V (case b, gate 1).
 * Order 2ES415235E815594L is case a: authorize $20.00 and capture $20.00.
 * docs/sandbox-run.json stores a clock only on the run: startedAt and finishedAt.
 * The steps below follow the order written in that file. They are not new calls.
 *
 * Failure counts are the disjoint buckets in eval/mix.ts, measured on the export
 * frozen at data/observatory_export.meta.json. "Broken" is paid 4xx + paid 5xx
 * + shape mismatch that was not also late + paid 2xx later than 15 seconds.
 */

export const SANDBOX_RUN_ID = "run-20261107034254";
export const SANDBOX_HOST = "api-m.sandbox.paypal.com";
export const SANDBOX_STARTED_AT = "2026-11-07T03:42:54.620Z";
export const SANDBOX_FINISHED_AT = "2026-11-07T03:43:41.883Z";

export const CASE_A = {
  orderId: "2ES415235E815594L",
  authorizationId: "4C53391800550971K",
  captureId: "30045445DC8145221",
  authorized: "20.00",
  captured: "20.00",
} as const;

export const GATE1 = {
  orderId: "68V137364A632645V",
  authorizationId: "27224167CR8866647",
  captureId: "9X732969JW2516540",
  authorized: "50.00",
  captured: "12.50",
} as const;

export const CASE_C = {
  orderId: "73461620V5719005Y",
  authorizationId: "00N1620869359422G",
  authorized: "30.00",
  issue: "AUTHORIZATION_VOIDED",
  httpStatus: 422,
} as const;

export const CASE_D = {
  orderId: "79G474448V9677001",
  authorizationId: "5UC11116RE2567125",
  captureId: "39R97432469952814",
  refundId: "6RK25870EY4268935",
  amount: "15.00",
} as const;

export const GATE2 = {
  orderId: "2VF918768H442974L",
  authorizationId: "4P108854H39466338",
  captureId: "6FC1708084437483W",
  paymentTokenId: "7p2918019c535510e",
  amount: "25.00",
  cardBrand: "VISA",
  cardLastDigits: "1881",
} as const;

export const FROZEN_EXPORT = {
  settled: 13_893,
  broken: 1_826,
  paid4xx: 736,
  paid5xx: 121,
  shape: 728,
  late: 241,
} as const;

export type ReplayId = "start" | "a" | "gate1" | "c" | "d" | "gate2" | "end";

export interface ReplayEvent {
  id: ReplayId;
  /** Clock stored for this beat. Null when the file has no time for the step. */
  at: string | null;
  ids: readonly string[];
}

/** Recorded order. Intermediate clocks are null on purpose. */
export const REPLAY_EVENTS: readonly ReplayEvent[] = [
  { id: "start", at: SANDBOX_STARTED_AT, ids: [SANDBOX_RUN_ID, SANDBOX_HOST] },
  { id: "a", at: null, ids: [CASE_A.orderId, CASE_A.authorizationId, CASE_A.captureId] },
  { id: "gate1", at: null, ids: [GATE1.orderId, GATE1.authorizationId, GATE1.captureId] },
  { id: "c", at: null, ids: [CASE_C.orderId, CASE_C.authorizationId, CASE_C.issue] },
  { id: "d", at: null, ids: [CASE_D.orderId, CASE_D.authorizationId, CASE_D.captureId, CASE_D.refundId] },
  { id: "gate2", at: null, ids: [GATE2.paymentTokenId, GATE2.orderId, GATE2.authorizationId, GATE2.captureId] },
  { id: "end", at: SANDBOX_FINISHED_AT, ids: [SANDBOX_RUN_ID] },
];

export function tickerLine(): string {
  return `Sandbox · authorized $${GATE1.authorized} · captured $${GATE1.captured} · order ${GATE1.orderId} · Frozen export · 13,893 settled · 1,826 broken`;
}

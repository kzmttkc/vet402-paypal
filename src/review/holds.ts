import { formatUsd, sumCents } from "../policy/money.js";
import type { ReviewRow } from "../server/desk.js";

export interface HoldView {
  jobId: string;
  sellerId: string;
  holdCents: number;
  hold: string;
  reason: string;
  conditionId: string;
  kind: ReviewRow["kind"];
  decision: ReviewRow["decision"];
  count: number;
  waitingMs: number;
  openItemIds: string[];
}

export function waitingLabel(ms: number): string {
  return `${Math.max(0, Math.floor(ms / 1000))} s`;
}

/** One row per hold. Fifty late records of the same hold stay on that one row. */
export function holdViews(rows: readonly ReviewRow[]): HoldView[] {
  const order: string[] = [];
  const groups = new Map<string, ReviewRow[]>();
  for (const row of rows) {
    const list = groups.get(row.jobId);
    if (list) list.push(row);
    else {
      groups.set(row.jobId, [row]);
      order.push(row.jobId);
    }
  }
  return order.map((jobId) => {
    const items = groups.get(jobId)!;
    const first = items[0]!;
    const reasons = [...new Set(items.map((row) => row.reason))];
    const open = items.filter((row) => row.decision === "open");
    const decision: ReviewRow["decision"] = open.length > 0 ? "open" : items.every((row) => row.decision === "void") ? "void" : "capture";
    const holdCents = sumCents(items.map((row) => row.holdCents));
    return {
      jobId,
      sellerId: first.sellerId,
      holdCents,
      hold: formatUsd(holdCents),
      reason: reasons.length === 1 ? reasons[0]! : reasons.join(", "),
      conditionId: first.conditionId,
      kind: first.kind,
      decision,
      count: items.length,
      waitingMs: Math.max(...items.map((row) => row.waitingMs)),
      openItemIds: open.map((row) => row.itemId),
    };
  });
}

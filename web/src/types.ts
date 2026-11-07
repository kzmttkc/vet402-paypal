export interface PlanItem {
  itemId: string;
  label: string;
  priceCents: number;
  price: string;
  progress: string;
}

export interface ConditionView {
  description: string;
  shape: Record<string, string>;
  ranges: Record<string, { min?: number; max?: number }>;
  formats: Record<string, string>;
  score: { passAt: number; voidBelow: number };
}

export interface JobView {
  jobId: string;
  brief: string;
  autonomy: "careful" | "balanced" | "autopilot";
  status: string;
  sellerId: string;
  sellerLine: string;
  holdCents: number;
  capturedCents: number;
  holdQuestion: string;
  holdReason: string;
  summary: string;
  orderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  conditionId: string;
  condition: ConditionView;
  items: PlanItem[];
}

export interface ReviewRow {
  jobId: string;
  itemId: string;
  sellerId: string;
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

export interface Health {
  ok: boolean;
  rail: "mock" | "sandbox";
  stopped: boolean;
  model?: { phase: "download" | "ready" | "failed"; ratio: number };
}

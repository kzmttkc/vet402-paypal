/**
 * Draft a job from a brief. Labels and counts may come from a template or from Claude.
 * Every cent is computed here. A number in the model's answer is never a price.
 */

export interface PlanItem {
  itemId: string;
  label: string;
  count: number;
  priceCents: number;
}

export interface JobPlan {
  description: string;
  items: PlanItem[];
  totalCents: number;
  passAt: number;
  voidBelow: number;
}

interface DraftItem {
  label: string;
  count: number;
}

interface Draft {
  description: string;
  items: DraftItem[];
}

const PASS_AT = 0.9;
const VOID_BELOW = 0.6;
const MAX_ITEMS = 20;
const MAX_COUNT = 500;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const PLAN_TOOL = {
  name: "report_plan",
  description: "Draft what to deliver and how many. Do not include prices or thresholds.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["description", "items"],
    properties: {
      description: { type: "string" },
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "count"],
          properties: {
            label: { type: "string" },
            count: { type: "integer", minimum: 1 },
          },
        },
      },
    },
  },
} as const;

export function parseCount(brief: string): number {
  const labeled = brief.match(/(\d{1,4})\s*(?:社|件|companies|company|records|record|items|item|deliveries|delivery)\b/i);
  const any = brief.match(/(\d{1,4})/);
  const raw = Number((labeled ?? any)?.[1]);
  if (!Number.isInteger(raw) || raw < 1) return 1;
  return Math.min(raw, MAX_COUNT);
}

export function templateDraft(brief: string): Draft {
  const text = brief.trim().slice(0, 180);
  const count = parseCount(text);
  return {
    description: `Deliver ${count} records for: ${text || "the request"}`,
    items: [{ label: text.slice(0, 80) || "Records", count }],
  };
}

function clampCount(count: number): number {
  if (!Number.isInteger(count) || count < 1) return 1;
  return Math.min(count, MAX_COUNT);
}

function labelOf(label: string, fallback: string): string {
  const text = label.replace(/\s+/g, " ").trim().slice(0, 80);
  return text || fallback;
}

/** Split `budgetCents` across the draft. `priceCents` on a draft item is not read. */
export function priceByCode(budgetCents: number, draft: Draft): JobPlan {
  if (!Number.isInteger(budgetCents) || budgetCents < 1) throw new TypeError("budgetCents must be a positive integer");
  const source = draft.items.length > 0 ? draft.items : [{ label: "Records", count: 1 }];
  const n = Math.min(source.length, budgetCents, MAX_ITEMS);
  const base = Math.floor(budgetCents / n);
  let leftover = budgetCents - base * n;
  const items: PlanItem[] = source.slice(0, n).map((it, i) => {
    const extra = leftover > 0 ? 1 : 0;
    leftover -= extra;
    return {
      itemId: `item-${i + 1}`,
      label: labelOf(it.label, `Item ${i + 1}`),
      count: clampCount(it.count),
      priceCents: base + extra,
    };
  });
  return {
    description: draft.description.replace(/\s+/g, " ").trim().slice(0, 280) || "Delivery",
    items,
    totalCents: items.reduce((sum, it) => sum + it.priceCents, 0),
    passAt: PASS_AT,
    voidBelow: VOID_BELOW,
  };
}

function draftFromModel(payload: unknown, fallback: Draft): Draft {
  if (payload === null || typeof payload !== "object") return fallback;
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return fallback;
  const tool = content.find((c): c is { type: string; name?: string; input?: unknown } => {
    return c !== null && typeof c === "object" && (c as { type?: unknown }).type === "tool_use";
  });
  if (!tool || tool.name !== "report_plan" || tool.input === null || typeof tool.input !== "object" || Array.isArray(tool.input)) {
    return fallback;
  }
  const input = tool.input as { description?: unknown; items?: unknown; passAt?: unknown; voidBelow?: unknown };
  const description = typeof input.description === "string" && input.description.trim() ? input.description : fallback.description;
  if (!Array.isArray(input.items)) return { description, items: fallback.items };
  const items: DraftItem[] = [];
  for (const raw of input.items) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as { label?: unknown; count?: unknown };
    if (typeof row.label !== "string" || typeof row.count !== "number") continue;
    items.push({ label: row.label, count: row.count });
  }
  if (items.length === 0) return { description, items: fallback.items };
  return { description, items };
}

async function claudeDraft(brief: string, key: string, fetchImpl: FetchLike, model: string): Promise<unknown> {
  const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system:
        "Draft the work as a description and a list of items with a label and a count. Do not propose prices, totals, or pass thresholds. Call report_plan only.",
      tools: [PLAN_TOOL],
      tool_choice: { type: "tool", name: "report_plan" },
      messages: [{ role: "user", content: brief.slice(0, 280) }],
    }),
  });
  if (!res.ok) throw new Error("plan draft failed");
  return res.json();
}

export async function planJob(
  brief: string,
  budgetCents: number,
  opts: { env?: Record<string, string | undefined>; fetch?: FetchLike } = {},
): Promise<JobPlan> {
  const text = brief.trim();
  if (!text) throw new TypeError("brief is required");
  const fallback = templateDraft(text);
  const env = opts.env ?? {};
  const key = env.ANTHROPIC_API_KEY?.trim();
  let draft = fallback;
  if (key) {
    const fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init));
    const model = env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";
    try {
      draft = draftFromModel(await claudeDraft(text, key, fetchImpl, model), fallback);
    } catch {
      draft = fallback;
    }
  }
  return priceByCode(budgetCents, draft);
}

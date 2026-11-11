/**
 * npm run sandbox:judged — one $50 hold for 50 records on the PayPal sandbox.
 *
 * Each arrived record is judged with the real rules and the default scorer.
 * Capture is the sum of the records that passed, with final_capture so the rest is released.
 * Zero passes voids the authorization. Ids in the file are read back with GET.
 *
 * Keys come only from PAYPAL_ENV, PAYPAL_CLIENT_ID, and PAYPAL_CLIENT_SECRET.
 * If any of those is missing, the process exits 2 and does not call PayPal.
 * Key values are never printed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { COMPANY_RECORDS } from "../eval/condition.js";
import { recordPrices, TRUTH_COUNT, TRUTH_HOLD_CENTS } from "../src/pay/truth.js";
import { sumCents } from "../src/policy/money.js";
import { SandboxPayPalRail } from "../src/rail/sandbox.js";
import { SANDBOX_TEST_CARD } from "../src/rail/select.js";
import type { PayPalRail, RailResource } from "../src/rail/types.js";
import { ConditionRegistry } from "../src/verify/condition.js";
import { defaultScorerFor, judge, type Delivery, type Outcome, type Scorer } from "../src/verify/judge.js";

const NAMES = [
  "Kizuna Logistics",
  "Northwind Foods",
  "Hanami Robotics",
  "Blue Ridge Energy",
  "Sakura Bio",
  "Atlas Freight",
  "Mizu Water Co.",
  "Orion Analytics",
  "Pine and Oak Ltd.",
  "Kaito Motors",
] as const;

export interface JudgedDelivery {
  itemId: string;
  priceCents: number;
  delivery: Delivery;
}

export interface JudgedRecord {
  itemId: string;
  outcome: Outcome;
  reason: string;
  priceCents: number;
}

export interface JudgedRunFile {
  at: string;
  holdCents: number;
  capturedCents: number;
  releasedCents: number;
  records: JudgedRecord[];
  readBack: {
    order: { id: string; status: string };
    authorization: { id: string; status: string };
    capture: { id: string; status: string; amountCents: number; finalCapture: boolean } | null;
  };
}

export function judgedRunPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../docs/sandbox-judged-run.json");
}

/** Missing or blank keys, or a mode other than sandbox, means do not call. */
export function paypalCreds(env: NodeJS.ProcessEnv): { clientId: string; clientSecret: string } | null {
  const mode = (env.PAYPAL_ENV ?? "").trim().toLowerCase();
  const clientId = (env.PAYPAL_CLIENT_ID ?? "").trim();
  const clientSecret = (env.PAYPAL_CLIENT_SECRET ?? "").trim();
  if (mode !== "sandbox" || clientId.length === 0 || clientSecret.length === 0) return null;
  return { clientId, clientSecret };
}

function companyDelivery(name: string, employees: number): Delivery {
  return {
    httpStatus: 200,
    body: JSON.stringify({
      records: [
        {
          name,
          country: "JP",
          employees,
          founded: 1998,
          source_url: "https://registry.example.org/c/1",
        },
      ],
    }),
    latencyMs: 200,
  };
}

function emptyDelivery(): Delivery {
  return { httpStatus: 200, body: "", latencyMs: 200 };
}

/** Fifty priced records. The last ten arrive empty so the rules can refuse them. */
export function defaultDeliveries(): JudgedDelivery[] {
  const prices = recordPrices(TRUTH_HOLD_CENTS, TRUTH_COUNT);
  return prices.map((priceCents, i) => ({
    itemId: `rec-${String(i + 1).padStart(2, "0")}`,
    priceCents,
    delivery: i < 40 ? companyDelivery(NAMES[i % NAMES.length]!, 40 + (i % 7)) : emptyDelivery(),
  }));
}

export async function judgeDeliveries(rows: readonly JudgedDelivery[], scorer?: Scorer): Promise<JudgedRecord[]> {
  const conditions = new ConditionRegistry();
  const conditionId = conditions.register(COMPANY_RECORDS);
  const cond = conditions.get(conditionId);
  const score = scorer ?? defaultScorerFor(cond);
  const records: JudgedRecord[] = [];
  for (const row of rows) {
    const verdict = await judge(cond, row.delivery, score);
    records.push({ itemId: row.itemId, outcome: verdict.outcome, reason: verdict.reason, priceCents: row.priceCents });
  }
  return records;
}

function asOrder(resource: RailResource): { id: string; status: string } {
  if (resource.kind !== "order") throw new Error("order read-back was not an order");
  return { id: resource.id, status: resource.status };
}

function asAuthorization(resource: RailResource): { id: string; status: string } {
  if (resource.kind !== "authorization") throw new Error("authorization read-back was not an authorization");
  return { id: resource.id, status: resource.status };
}

function asCapture(resource: RailResource): { id: string; status: string; amountCents: number; finalCapture: boolean } {
  if (resource.kind !== "capture") throw new Error("capture read-back was not a capture");
  return { id: resource.id, status: resource.status, amountCents: resource.amountCents, finalCapture: resource.finalCapture };
}

/**
 * Authorize $50, judge the records, capture only what passed (final_capture),
 * then GET the order, authorization, and capture.
 */
export async function runJudgedSandbox(opts: {
  rail: PayPalRail;
  scorer?: Scorer;
  rows?: readonly JudgedDelivery[];
  now?: () => Date;
  outPath?: string;
}): Promise<JudgedRunFile> {
  const rows = opts.rows ?? defaultDeliveries();
  if (rows.length !== TRUTH_COUNT) throw new Error(`expected ${TRUTH_COUNT} records`);
  if (sumCents(rows.map((row) => row.priceCents)) !== TRUTH_HOLD_CENTS) throw new Error("record prices must sum to the $50 hold");

  const stamp = (opts.now ?? (() => new Date()))().toISOString().replace(/[-:.TZ]/g, "");
  const rid = (step: string) => `judged-${stamp}:${step}`;
  const order = await opts.rail.createOrder(
    {
      intent: "AUTHORIZE",
      amountCents: TRUTH_HOLD_CENTS,
      currency: "USD",
      payeeId: "seller.sandbox",
      referenceId: `judged-${stamp}`,
    },
    rid("create"),
  );
  const auth = await opts.rail.authorize(order.id, rid("authorize"));
  const records = await judgeDeliveries(rows, opts.scorer);
  const passedCents = sumCents(records.filter((row) => row.outcome === "capture").map((row) => row.priceCents));
  const captureId = passedCents > 0
    ? (await opts.rail.capture(auth.id, passedCents, rid("capture"), { finalCapture: true })).id
    : null;
  if (captureId === null) await opts.rail.void(auth.id, rid("void"));

  const orderRead = asOrder(await opts.rail.get(order.id));
  const authorizationRead = asAuthorization(await opts.rail.get(auth.id));
  const captureRead = captureId === null ? null : asCapture(await opts.rail.get(captureId));
  const capturedCents = captureRead?.amountCents ?? 0;
  const file: JudgedRunFile = {
    at: (opts.now ?? (() => new Date()))().toISOString(),
    holdCents: TRUTH_HOLD_CENTS,
    capturedCents,
    releasedCents: TRUTH_HOLD_CENTS - capturedCents,
    records,
    readBack: { order: orderRead, authorization: authorizationRead, capture: captureRead },
  };
  const outPath = opts.outPath ?? judgedRunPath();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`);
  return file;
}

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

async function main(): Promise<number> {
  const creds = paypalCreds(process.env);
  if (!creds) {
    console.error("PayPal sandbox credentials are not set.");
    return 2;
  }
  const rail = new SandboxPayPalRail({ clientId: creds.clientId, clientSecret: creds.clientSecret, paymentSource: SANDBOX_TEST_CARD });
  // Without a Claude key the default score is the local Qwen3. Load it before judging, as the server does at start.
  if (!process.env.ANTHROPIC_API_KEY?.trim() && process.env.SCORER !== "embedding") {
    const { beginModelLoad } = await import("../src/verify/warmup.js");
    await beginModelLoad();
  }
  const file = await runJudgedSandbox({ rail });
  console.log(`sandbox-judged captured=${file.capturedCents} released=${file.releasedCents} → docs/sandbox-judged-run.json`);
  return 0;
}

if (invokedDirectly()) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "sandbox-judged failed";
      console.error(message);
      process.exit(1);
    });
}

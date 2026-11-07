/**
 * npm run demo:sandbox — the engine against the real PayPal sandbox (PAYPAL_ENV=sandbox from .env).
 * Job 1: an honest delivery → capture. Job 2: an empty 200 → void.
 * Prints one line per job with the PayPal ids, then the statuses read back from the API.
 */
import { COMPANY_RECORDS } from "../eval/condition.js";
import { PaymentEngine, railFromEnv } from "../src/engine/index.js";
import { PolicyStore } from "../src/policy/mandate.js";
import { ConditionRegistry } from "../src/verify/condition.js";

if ((process.env.PAYPAL_ENV ?? "").toLowerCase() !== "sandbox") throw new Error("set PAYPAL_ENV=sandbox (npm run demo:sandbox loads .env)");

const rail = railFromEnv();
const conditions = new ConditionRegistry();
const conditionId = conditions.register(COMPANY_RECORDS);
const seller = "seller.sandbox";
const policy = new PolicyStore({
  id: "demo-sandbox",
  budgetCents: 20_000,
  allowedSellers: [seller],
  expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  revoked: false,
  autonomy: "autopilot",
  autoApproveMaxCents: 5_000,
  dailyCapCents: 15_000,
  monthlyCapCents: 18_000,
});
const engine = new PaymentEngine({ rail, policy, conditions });
const run = `demo-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

const honest = {
  httpStatus: 200,
  body: JSON.stringify({
    records: [
      { name: "Kizuna Logistics", country: "JP", employees: 120, founded: 1998, source_url: "https://registry.example.org/c/1" },
      { name: "Northwind Foods", country: "US", employees: 4500, founded: 1972, source_url: "https://registry.example.org/c/2" },
    ],
  }),
  latencyMs: 800,
};
const empty = { httpStatus: 200, body: "", latencyMs: 400 };

const jobs = [
  { jobId: `${run}-honest`, delivery: honest },
  { jobId: `${run}-empty`, delivery: empty },
];

for (const { jobId, delivery } of jobs) {
  const items = [
    { itemId: "batch-1", priceCents: 1_200 },
    { itemId: "batch-2", priceCents: 800 },
  ];
  const a = await engine.requestJob({ jobId, sellerId: seller, items, conditionId });
  if (a.status !== "authorized") throw new Error(`${jobId} was not authorized: ${a.status} ${a.reasons.join(",")}`);
  const r = await engine.settle(jobId, { "batch-1": delivery, "batch-2": delivery });
  const j = engine.job(jobId)!;
  const auth = (await rail.get(j.authorizationId!)) as { status: string };
  const cap = r.captureId ? ((await rail.get(r.captureId)) as { status: string; amountCents: number }) : null;
  console.log(
    `${rail.name} job=${jobId} outcome=${r.status} order=${j.orderId} authorization=${j.authorizationId} (read back: ${auth.status})` +
      (cap ? ` capture=${r.captureId} (read back: ${cap.status} ${(cap.amountCents / 100).toFixed(2)} USD)` : ""),
  );
}
const chain = engine.ledger.verifyChain();
console.log(`ledger entries=${engine.ledger.entries().length} chain_ok=${chain.ok}`);

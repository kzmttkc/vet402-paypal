/**
 * npm run sandbox:run — one pass against the real PayPal sandbox, written to docs/sandbox-run.json.
 *
 *   a. authorize → full capture
 *   b. authorize → capture less than authorized, final_capture=true   (gate 1)
 *   c. authorize → void → capture after void is refused
 *   d. authorize → capture → refund
 *   gate 2: buyer-not-present authorize with a vaulted card (Vault v3), and what the PayPal-wallet vault needs
 *   buyer-approval path: order with an approve link (not approved here)
 *
 * Every id and status in the file is read back from the API after the call that made it.
 * No key, secret or token is written anywhere.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PayPalApiError, SandboxPayPalRail, SANDBOX_HOST, type PaymentSource } from "../src/rail/sandbox.js";
import { SANDBOX_TEST_CARD } from "../src/rail/select.js";
import { RailError } from "../src/rail/types.js";

const env = process.env;
if ((env.PAYPAL_ENV ?? "").toLowerCase() !== "sandbox") throw new Error("set PAYPAL_ENV=sandbox (npm run sandbox:run loads .env)");
const creds = { clientId: env.PAYPAL_CLIENT_ID ?? "", clientSecret: env.PAYPAL_CLIENT_SECRET ?? "" };
const rail = new SandboxPayPalRail({ ...creds, paymentSource: SANDBOX_TEST_CARD });
const run = `run-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const rid = (s: string) => `${run}:${s}`;

type J = Record<string, any>;
const err = (e: unknown): J =>
  e instanceof PayPalApiError
    ? { refused: true, code: e.code, issue: e.issue, httpStatus: e.httpStatus, debugId: e.debugId }
    : e instanceof RailError
      ? { refused: true, code: e.code, message: e.message }
      : (() => {
          throw e;
        })();

/** Read back from the API and keep only what the record needs. */
async function readOrder(id: string): Promise<J> {
  const o = await rail.getRaw("order", id);
  const pu = o.purchase_units?.[0] ?? {};
  return { id: o.id, status: o.status, intent: o.intent, amount: pu.amount?.value, reference_id: pu.reference_id };
}
async function readAuth(id: string): Promise<J> {
  const a = await rail.getRaw("authorization", id);
  return { id: a.id, status: a.status, amount: a.amount?.value, expiration_time: a.expiration_time };
}
async function readCapture(id: string): Promise<J> {
  const c = await rail.getRaw("capture", id);
  return { id: c.id, status: c.status, amount: c.amount?.value, final_capture: c.final_capture };
}
async function readRefund(id: string): Promise<J> {
  const r = await rail.getRaw("refund", id);
  return { id: r.id, status: r.status, amount: r.amount?.value };
}

async function authorized(tag: string, cents: number, r: SandboxPayPalRail = rail) {
  const order = await r.createOrder({ intent: "AUTHORIZE", amountCents: cents, currency: "USD", payeeId: "seller.sandbox", referenceId: `${run}-${tag}` }, rid(`${tag}:create`));
  const auth = await r.authorize(order.id, rid(`${tag}:authorize`));
  return { order, auth };
}

const out: J = { host: SANDBOX_HOST, run, startedAt: new Date().toISOString(), readBack: "every id/status below was read with GET after the call that made it", cases: {}, gates: {} };

// a. authorize → full capture
{
  const { order, auth } = await authorized("a", 2_000);
  const cap = await rail.capture(auth.id, 2_000, rid("a:capture"), { finalCapture: true });
  out.cases.a = { what: "authorize $20.00 → capture $20.00", order: await readOrder(order.id), authorization: await readAuth(auth.id), capture: await readCapture(cap.id) };
}

// b. authorize → capture less than authorized (gate 1)
{
  const { order, auth } = await authorized("b", 5_000);
  let capture: J;
  try {
    const cap = await rail.capture(auth.id, 1_250, rid("b:capture"), { finalCapture: true });
    capture = await readCapture(cap.id);
  } catch (e) {
    capture = err(e);
  }
  out.cases.b = { what: "authorize $50.00 → capture $12.50 with final_capture=true", order: await readOrder(order.id), authorization: await readAuth(auth.id), capture };
  const norm = await rail.get(auth.id);
  out.gates.gate1 = {
    question: "can we capture less than the authorized amount?",
    passed: !capture.refused,
    evidence: capture.refused
      ? `refused: ${capture.issue ?? capture.code}`
      : `authorization ${auth.id} status ${out.cases.b.authorization.status}, captured ${capture.amount} of ${out.cases.b.authorization.amount}; rail reads capturedCents=${(norm as J).capturedCents}`,
  };
}

// c. authorize → void → capture after void
{
  const { order, auth } = await authorized("c", 3_000);
  await rail.void(auth.id, rid("c:void"));
  let captureAfterVoid: J;
  try {
    const cap = await rail.capture(auth.id, 1_000, rid("c:capture-after-void"), { finalCapture: true });
    captureAfterVoid = { refused: false, capture: await readCapture(cap.id) };
  } catch (e) {
    captureAfterVoid = err(e);
  }
  out.cases.c = { what: "authorize $30.00 → void → capture $10.00", order: await readOrder(order.id), authorization: await readAuth(auth.id), captureAfterVoid };
}

// d. authorize → capture → refund
{
  const { order, auth } = await authorized("d", 1_500);
  const cap = await rail.capture(auth.id, 1_500, rid("d:capture"), { finalCapture: true });
  const ref = await rail.refund(cap.id, 1_500, rid("d:refund"));
  out.cases.d = {
    what: "authorize $15.00 → capture $15.00 → refund $15.00",
    order: await readOrder(order.id),
    authorization: await readAuth(auth.id),
    capture: await readCapture(cap.id),
    refund: await readRefund(ref.id),
  };
}

// gate 2: buyer not present — vaulted card (Vault v3), then a merchant-initiated authorize with vault_id
{
  const g: J = { question: "can we authorize with a saved payment method while the buyer is not present?", docs: [] };
  try {
    const setup = await rail.request("POST", "/v3/vault/setup-tokens", {
      requestId: rid("g2:setup-token"),
      body: { payment_source: { card: { ...(SANDBOX_TEST_CARD.card as J), experience_context: { return_url: "https://example.com/return", cancel_url: "https://example.com/cancel" } } } },
    });
    const setupRead = await rail.request("GET", `/v3/vault/setup-tokens/${setup.id}`);
    g.setupToken = { id: setupRead.id, status: setupRead.status };
    const token = await rail.request("POST", "/v3/vault/payment-tokens", {
      requestId: rid("g2:payment-token"),
      body: { payment_source: { token: { id: setup.id, type: "SETUP_TOKEN" } } },
    });
    const tokenRead = await rail.request("GET", `/v3/vault/payment-tokens/${token.id}`);
    g.paymentToken = { id: tokenRead.id, card_last_digits: tokenRead.payment_source?.card?.last_digits, card_brand: tokenRead.payment_source?.card?.brand };

    const attempt = async (tag: string, source: PaymentSource) => {
      const r = new SandboxPayPalRail({ ...creds, paymentSource: source });
      try {
        const { order, auth } = await authorized(tag, 2_500, r);
        const cap = await r.capture(auth.id, 2_500, rid(`${tag}:capture`), { finalCapture: true });
        return { refused: false, order: await readOrder(order.id), authorization: await readAuth(auth.id), capture: await readCapture(cap.id) };
      } catch (e) {
        return err(e);
      }
    };
    g.merchantInitiated = {
      payment_source: "card.vault_id + stored_credential(MERCHANT, UNSCHEDULED, SUBSEQUENT)",
      ...(await attempt("g2-mit", { card: { vault_id: token.id, stored_credential: { payment_initiator: "MERCHANT", payment_type: "UNSCHEDULED", usage: "SUBSEQUENT" } } })),
    };
    if (g.merchantInitiated.refused) {
      g.vaultIdOnly = { payment_source: "card.vault_id", ...(await attempt("g2-vid", { card: { vault_id: token.id } })) };
    }
  } catch (e) {
    g.vaultCard = err(e);
  }
  // PayPal wallet vault: a setup token for the buyer's PayPal account needs the buyer to approve once.
  try {
    const st = await rail.request("POST", "/v3/vault/setup-tokens", {
      requestId: rid("g2:paypal-setup-token"),
      body: { payment_source: { paypal: { usage_type: "MERCHANT", experience_context: { return_url: "https://example.com/return", cancel_url: "https://example.com/cancel" } } } },
    });
    const read = await rail.request("GET", `/v3/vault/setup-tokens/${st.id}`);
    const link = (read.links ?? st.links ?? []).find((l: J) => l.rel === "approve" || l.rel === "payer-action");
    g.paypalWallet = { setupToken: { id: read.id, status: read.status }, approveLinkHost: link ? new URL(link.href).host : null, approved: false };
  } catch (e) {
    g.paypalWallet = err(e);
  }
  const mit = g.merchantInitiated ?? {};
  const vid = g.vaultIdOnly ?? {};
  g.passed = mit.refused === false || vid.refused === false;
  g.docs.push(
    "https://developer.paypal.com/docs/checkout/save-payment-methods/during-purchase/orders-api/cards/",
    "https://developer.paypal.com/docs/api/payment-tokens/v3/",
  );
  out.gates.gate2 = g;
}

// buyer-approval path (PayPal balance): create the order and its approve link; nobody approves it here.
{
  const { order, approveUrl } = await rail.createOrderForBuyerApproval(
    { intent: "AUTHORIZE", amountCents: 2_000, currency: "USD", payeeId: "seller.sandbox", referenceId: `${run}-approval` },
    rid("approval:create"),
    { returnUrl: "https://example.com/return", cancelUrl: "https://example.com/cancel" },
  );
  out.buyerApproval = { order: await readOrder(order.id), approveLinkHost: new URL(approveUrl).host, approved: false };
}

out.finishedAt = new Date().toISOString();
const file = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/sandbox-run.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
const c = out.cases;
console.log(
  `sandbox-run ${run} a=${c.a.capture.status} b=${c.b.capture.status ?? c.b.capture.issue} c=${c.c.authorization.status}/after-void:${c.c.captureAfterVoid.issue ?? "NOT_REFUSED"} d=${c.d.capture.status}/${c.d.refund.status} gate1=${out.gates.gate1.passed} gate2=${out.gates.gate2.passed} → docs/sandbox-run.json`,
);

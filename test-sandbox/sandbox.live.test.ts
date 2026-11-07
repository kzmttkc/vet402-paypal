/**
 * npm run test:sandbox — against the real PayPal sandbox with the keys in .env (never printed).
 * Kept out of the default `npm test`, which runs with no network.
 */
import { describe, expect, it } from "vitest";
import { COMPANY_RECORDS } from "../eval/condition.js";
import { PaymentEngine, railFromEnv } from "../src/engine/index.js";
import { PolicyStore } from "../src/policy/mandate.js";
import { SandboxPayPalRail } from "../src/rail/sandbox.js";
import { RailError, type Authorization, type Capture } from "../src/rail/types.js";
import { ConditionRegistry } from "../src/verify/condition.js";

if ((process.env.PAYPAL_ENV ?? "").toLowerCase() !== "sandbox") throw new Error("test:sandbox needs PAYPAL_ENV=sandbox in .env");

const rail = railFromEnv() as SandboxPayPalRail;
const run = `t-${Date.now().toString(36)}`;
const rid = (s: string) => `${run}:${s}`;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof RailError ? e.code : String(e)));

async function authorized(tag: string, cents: number) {
  const o = await rail.createOrder({ intent: "AUTHORIZE", amountCents: cents, currency: "USD", payeeId: "seller.sandbox", referenceId: `${run}-${tag}` }, rid(`${tag}:create`));
  return rail.authorize(o.id, rid(`${tag}:authorize`));
}

describe("PayPal sandbox (live)", () => {
  it("talks to the sandbox host only", () => {
    expect(rail).toBeInstanceOf(SandboxPayPalRail);
    expect(rail.baseUrl).toBe("https://api-m.sandbox.paypal.com");
  });

  it("authorize → full capture; the same request id returns the same capture", async () => {
    const a = await authorized("full", 1_000);
    expect(a.status).toBe("CREATED");
    const c1 = await rail.capture(a.id, 1_000, rid("full:capture"));
    const c2 = await rail.capture(a.id, 1_000, rid("full:capture"));
    expect(c2.id).toBe(c1.id);
    expect(await rail.get(a.id)).toMatchObject({ status: "CAPTURED", capturedCents: 1_000 });
  });

  it("capture less than authorized with final_capture closes the authorization (gate 1)", async () => {
    const a = await authorized("part", 4_000);
    const c = await rail.capture(a.id, 1_100, rid("part:capture"), { finalCapture: true });
    expect((await rail.get(c.id)) as Capture).toMatchObject({ status: "COMPLETED", amountCents: 1_100, finalCapture: true });
    expect((await rail.get(a.id)) as Authorization).toMatchObject({ status: "CAPTURED", capturedCents: 1_100, amountCents: 4_000 });
  });

  it("void → capture after void is refused", async () => {
    const a = await authorized("void", 2_000);
    expect((await rail.void(a.id, rid("void:void"))).status).toBe("VOIDED");
    expect(await code(rail.capture(a.id, 500, rid("void:capture")))).toBe("AUTHORIZATION_VOIDED");
  });

  it("capture → refund", async () => {
    const a = await authorized("refund", 1_500);
    const c = await rail.capture(a.id, 1_500, rid("refund:capture"));
    const r = await rail.refund(c.id, 1_500, rid("refund:refund"));
    expect(await rail.get(r.id)).toMatchObject({ kind: "refund", captureId: c.id, amountCents: 1_500 });
    expect(await rail.get(c.id)).toMatchObject({ status: "REFUNDED", refundedCents: 1_500 });
  });

  it("engine: honest delivery → capture, empty delivery → void", async () => {
    const conditions = new ConditionRegistry();
    const conditionId = conditions.register(COMPANY_RECORDS);
    const policy = new PolicyStore({
      id: "live-test",
      budgetCents: 10_000,
      allowedSellers: ["seller.sandbox"],
      expiresAt: Date.now() + 3_600_000,
      revoked: false,
      autonomy: "autopilot",
      autoApproveMaxCents: 5_000,
      dailyCapCents: 10_000,
      monthlyCapCents: 10_000,
    });
    const engine = new PaymentEngine({ rail, policy, conditions });
    const items = [{ itemId: "i1", priceCents: 900 }];
    const body = JSON.stringify({ records: [{ name: "Kizuna Logistics", country: "JP", employees: 120, founded: 1998, source_url: "https://registry.example.org/c/1" }] });
    await engine.requestJob({ jobId: `${run}-honest`, sellerId: "seller.sandbox", items, conditionId });
    await engine.requestJob({ jobId: `${run}-empty`, sellerId: "seller.sandbox", items, conditionId });
    const ok = await engine.settle(`${run}-honest`, { i1: { httpStatus: 200, body, latencyMs: 500 } });
    const bad = await engine.settle(`${run}-empty`, { i1: { httpStatus: 200, body: "", latencyMs: 300 } });
    expect(ok).toMatchObject({ status: "captured", capturedCents: 900 });
    expect(bad.status).toBe("voided");
    expect(await rail.get(engine.job(`${run}-empty`)!.authorizationId!)).toMatchObject({ status: "VOIDED" });
  });
});

import { describe, expect, it } from "vitest";
import { PaymentEngine } from "../src/engine/index.js";
import { PolicyStore } from "../src/policy/mandate.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import { centsToValue, PayPalApiError, SandboxPayPalRail, valueToCents, type FetchLike } from "../src/rail/sandbox.js";
import { railFromEnv, SANDBOX_TEST_CARD } from "../src/rail/select.js";
import { RailError } from "../src/rail/types.js";
import { ConditionRegistry } from "../src/verify/condition.js";
import { COMPANY_RECORDS } from "../eval/condition.js";
import { good, mandate } from "./helpers.js";

const SECRET = "test-secret-should-never-leak";
const TOKEN = "A21AA-fake-token-should-never-leak";

interface Seen {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: any;
}

/** A small stateful stand-in for the PayPal sandbox, enough for the rail's calls. No network. */
function fakePayPal(opts: { failFirst?: number } = {}) {
  const seen: Seen[] = [];
  const orders = new Map<string, any>();
  const auths = new Map<string, any>();
  const caps = new Map<string, any>();
  const refs = new Map<string, any>();
  const byRequestId = new Map<string, { status: number; body: any }>();
  let n = 0;
  let failures = opts.failFirst ?? 0;
  const id = (p: string) => `${p}${String(++n).padStart(13, "0")}`;
  const B = "https://api-m.sandbox.paypal.com";
  const res = (status: number, body?: unknown) => ({ status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
  const issue = (status: number, name: string) => res(status, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: name, description: name }], debug_id: "dbg1" });
  const orderView = (o: any) => ({
    id: o.id,
    status: o.status,
    intent: "AUTHORIZE",
    create_time: "2026-11-07T00:00:00Z",
    purchase_units: [
      {
        reference_id: o.reference_id,
        custom_id: o.custom_id,
        amount: o.amount,
        payments: {
          authorizations: o.authId ? [auths.get(o.authId)] : undefined,
          captures: [...caps.values()].filter((c) => c.orderId === o.id).map((c) => ({ ...c, links: [{ rel: "up", href: `${B}/v2/payments/authorizations/${c.authId}` }] })),
          refunds: [...refs.values()].filter((r) => r.orderId === o.id).map((r) => ({ ...r, links: [{ rel: "up", href: `${B}/v2/payments/captures/${r.capId}` }] })),
        },
      },
    ],
  });
  const fetch: FetchLike = async (url, init) => {
    const path = url.replace(B, "");
    const body = init.body && init.headers["Content-Type"] === "application/json" ? JSON.parse(init.body) : init.body;
    seen.push({ method: init.method, path, headers: init.headers, body });
    if (path === "/v1/oauth2/token") return res(200, { access_token: TOKEN, token_type: "Bearer", expires_in: 32000 });
    if (init.headers.Authorization !== `Bearer ${TOKEN}`) return res(401, { name: "AUTHENTICATION_FAILURE" });
    if (failures > 0) {
      failures -= 1;
      return res(503, { name: "SERVICE_UNAVAILABLE" });
    }
    const rid = init.headers["PayPal-Request-Id"];
    if (init.method === "POST" && rid && byRequestId.has(rid)) {
      const r = byRequestId.get(rid)!;
      return res(r.status, r.body);
    }
    const ok = (status: number, b: any) => {
      if (rid) byRequestId.set(rid, { status, body: b });
      return res(status, b);
    };
    let m: RegExpExecArray | null;
    if (init.method === "POST" && path === "/v2/checkout/orders") {
      const pu = body.purchase_units[0];
      const o = { id: id("O"), status: "CREATED", reference_id: pu.reference_id, custom_id: pu.custom_id, amount: pu.amount, authId: null as string | null };
      orders.set(o.id, o);
      return ok(201, orderView(o));
    }
    if ((m = /^\/v2\/checkout\/orders\/(\w+)\/authorize$/.exec(path))) {
      const o = orders.get(m[1]!);
      if (!o) return issue(404, "INVALID_RESOURCE_ID");
      if (o.authId) return issue(422, "ORDER_ALREADY_AUTHORIZED");
      if (!body.payment_source) return issue(422, "ORDER_NOT_APPROVED");
      const a = { id: id("A"), status: "CREATED", amount: o.amount, create_time: "2026-11-07T00:00:00Z", expiration_time: "2026-12-06T00:00:00Z", supplementary_data: { related_ids: { order_id: o.id } } };
      auths.set(a.id, a);
      o.authId = a.id;
      o.status = "COMPLETED";
      return ok(201, orderView(o));
    }
    if ((m = /^\/v2\/payments\/authorizations\/(\w+)\/capture$/.exec(path))) {
      const a = auths.get(m[1]!);
      if (!a) return issue(404, "INVALID_RESOURCE_ID");
      if (a.status === "VOIDED") return issue(422, "AUTHORIZATION_VOIDED");
      if (a.status === "CAPTURED") return issue(422, "AUTHORIZATION_ALREADY_CAPTURED");
      if (valueToCents(body.amount.value) > valueToCents(a.amount.value)) return issue(422, "MAX_CAPTURE_AMOUNT_EXCEEDED");
      const c = { id: id("C"), status: "COMPLETED", amount: body.amount, final_capture: body.final_capture, create_time: "2026-11-07T00:01:00Z", orderId: a.supplementary_data.related_ids.order_id, authId: a.id, supplementary_data: { related_ids: { order_id: a.supplementary_data.related_ids.order_id, authorization_id: a.id } } };
      caps.set(c.id, c);
      a.status = "CAPTURED";
      return ok(201, c);
    }
    if ((m = /^\/v2\/payments\/authorizations\/(\w+)\/void$/.exec(path))) {
      const a = auths.get(m[1]!);
      if (!a) return issue(404, "INVALID_RESOURCE_ID");
      if (a.status === "VOIDED") return issue(422, "PREVIOUSLY_VOIDED");
      a.status = "VOIDED";
      return ok(204, undefined);
    }
    if ((m = /^\/v2\/payments\/captures\/(\w+)\/refund$/.exec(path))) {
      const c = caps.get(m[1]!);
      if (!c) return issue(404, "INVALID_RESOURCE_ID");
      const r = { id: id("R"), status: "COMPLETED", amount: body.amount, create_time: "2026-11-07T00:02:00Z", orderId: c.orderId, capId: c.id, links: [{ rel: "up", href: `${B}/v2/payments/captures/${c.id}` }] };
      refs.set(r.id, r);
      c.status = "REFUNDED";
      return ok(201, r);
    }
    if (init.method === "GET") {
      if ((m = /^\/v2\/checkout\/orders\/(\w+)$/.exec(path))) return orders.has(m[1]!) ? res(200, orderView(orders.get(m[1]!))) : issue(404, "INVALID_RESOURCE_ID");
      if ((m = /^\/v2\/payments\/authorizations\/(\w+)$/.exec(path))) return auths.has(m[1]!) ? res(200, auths.get(m[1]!)) : issue(404, "INVALID_RESOURCE_ID");
      if ((m = /^\/v2\/payments\/captures\/(\w+)$/.exec(path))) return caps.has(m[1]!) ? res(200, caps.get(m[1]!)) : issue(404, "INVALID_RESOURCE_ID");
      if ((m = /^\/v2\/payments\/refunds\/(\w+)$/.exec(path))) return refs.has(m[1]!) ? res(200, refs.get(m[1]!)) : issue(404, "INVALID_RESOURCE_ID");
    }
    return issue(404, "NOT_FOUND");
  };
  return { fetch, seen };
}

const rail = (f: ReturnType<typeof fakePayPal>, over: Record<string, unknown> = {}) =>
  new SandboxPayPalRail({ clientId: "test-client", clientSecret: SECRET, paymentSource: SANDBOX_TEST_CARD, fetch: f.fetch, ...over });

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof RailError ? e.code : String(e)));

async function authorized(r: SandboxPayPalRail, cents = 5_000) {
  const o = await r.createOrder({ intent: "AUTHORIZE", amountCents: cents, currency: "USD", payeeId: "seller.good", referenceId: "job-1" }, "job-1:create");
  return r.authorize(o.id, "job-1:authorize");
}

describe("sandbox PayPal rail (offline, fake PayPal)", () => {
  it("only accepts the sandbox host over https", () => {
    for (const baseUrl of ["https://api-m.example.com", "http://api-m.sandbox.paypal.com", "https://api-m.sandbox.paypal.com.evil.test", "not a url"]) {
      expect(() => new SandboxPayPalRail({ clientId: "a", clientSecret: "b", baseUrl })).toThrow(/sandbox/);
    }
    expect(new SandboxPayPalRail({ clientId: "a", clientSecret: "b" }).baseUrl).toBe("https://api-m.sandbox.paypal.com");
  });

  it("converts integer cents to PayPal values and back without floats", () => {
    expect(centsToValue(1)).toBe("0.01");
    expect(centsToValue(1_250)).toBe("12.50");
    expect(centsToValue(20_000)).toBe("200.00");
    expect(valueToCents("12.5")).toBe(1_250);
    expect(valueToCents("0.07")).toBe(7);
    expect(() => valueToCents("1e3")).toThrow(RailError);
    expect(() => centsToValue(19.99)).toThrow(RailError);
  });

  it("create + authorize: PayPal-Request-Id on every POST, card in the authorize body, mapped to the rail types", async () => {
    const f = fakePayPal();
    const r = rail(f);
    const a = await authorized(r, 4_321);
    const posts = f.seen.filter((s) => s.method === "POST" && s.path.startsWith("/v2"));
    expect(posts.map((p) => p.headers["PayPal-Request-Id"])).toEqual(["job-1:create", "job-1:authorize"]);
    expect(posts[0]!.body.purchase_units[0]).toMatchObject({ amount: { currency_code: "USD", value: "43.21" }, custom_id: "seller.good", reference_id: "job-1" });
    expect(posts[0]!.body.intent).toBe("AUTHORIZE");
    expect(posts[1]!.body.payment_source).toEqual(SANDBOX_TEST_CARD);
    expect(a).toMatchObject({ kind: "authorization", status: "CREATED", amountCents: 4_321, currency: "USD", capturedCents: 0 });
    expect(a.expiresAt).toBe(Date.parse("2026-12-06T00:00:00Z"));
    const o = await r.get(a.orderId);
    expect(o).toMatchObject({ kind: "order", status: "COMPLETED", payeeId: "seller.good", authorizationId: a.id });
  });

  it("partial capture sends amount and final_capture; reads back capturedCents from the order", async () => {
    const f = fakePayPal();
    const r = rail(f);
    const a = await authorized(r, 5_000);
    const cap = await r.capture(a.id, 1_250, "job-1:capture", { finalCapture: true });
    const sent = f.seen.find((s) => s.path.endsWith("/capture"))!;
    expect(sent.body).toEqual({ amount: { currency_code: "USD", value: "12.50" }, final_capture: true });
    expect(cap).toMatchObject({ kind: "capture", authorizationId: a.id, amountCents: 1_250, finalCapture: true, status: "COMPLETED" });
    const back = (await r.get(a.id)) as { status: string; capturedCents: number; captureIds: string[] };
    expect(back).toMatchObject({ status: "CAPTURED", capturedCents: 1_250, captureIds: [cap.id] });
  });

  it("void then capture is refused with AUTHORIZATION_VOIDED; void returns the read-back authorization", async () => {
    const r = rail(fakePayPal());
    const a = await authorized(r);
    const v = await r.void(a.id, "job-1:void");
    expect(v.status).toBe("VOIDED");
    expect(await code(r.capture(a.id, 1_000, "job-1:capture"))).toBe("AUTHORIZATION_VOIDED");
    expect(await code(r.void(a.id, "job-1:void-2"))).toBe("AUTHORIZATION_VOIDED");
  });

  it("refund maps to the rail type and the capture reads back refundedCents", async () => {
    const r = rail(fakePayPal());
    const a = await authorized(r);
    const cap = await r.capture(a.id, 3_000, "job-1:capture");
    const ref = await r.refund(cap.id, 3_000, "job-1:refund:1");
    expect(ref).toMatchObject({ kind: "refund", captureId: cap.id, amountCents: 3_000 });
    expect(await r.get(ref.id)).toMatchObject({ kind: "refund", captureId: cap.id });
    expect(await r.get(cap.id)).toMatchObject({ kind: "capture", status: "REFUNDED", refundedCents: 3_000 });
  });

  it("PayPal issue names map to rail codes; errors never carry the secret or the token", async () => {
    const r = rail(fakePayPal());
    const a = await authorized(r, 1_000);
    const e = await r.capture(a.id, 1_001, "job-1:over").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(PayPalApiError);
    expect((e as PayPalApiError).code).toBe("MAX_CAPTURE_AMOUNT_EXCEEDED");
    expect((e as PayPalApiError).issue).toBe("MAX_CAPTURE_AMOUNT_EXCEEDED");
    expect((e as PayPalApiError).httpStatus).toBe(422);
    expect(String((e as Error).message)).not.toContain(SECRET);
    expect(String((e as Error).message)).not.toContain(TOKEN);
    expect(await code(r.get("NOSUCHID0000"))).toBe("RESOURCE_NOT_FOUND");
  });

  it("a 5xx is retried with the same PayPal-Request-Id", async () => {
    const f = fakePayPal({ failFirst: 1 });
    const r = rail(f);
    await r.createOrder({ intent: "AUTHORIZE", amountCents: 500, currency: "USD", payeeId: "s", referenceId: "r" }, "k-create");
    const creates = f.seen.filter((s) => s.path === "/v2/checkout/orders");
    expect(creates).toHaveLength(2);
    expect(creates.every((c) => c.headers["PayPal-Request-Id"] === "k-create")).toBe(true);
  });

  it("same request id + same payload → PayPal's stored result; different payload → refused before any call", async () => {
    const f = fakePayPal();
    const r = rail(f);
    const a = await authorized(r);
    const c1 = await r.capture(a.id, 1_000, "k-cap");
    const c2 = await r.capture(a.id, 1_000, "k-cap");
    expect(c2.id).toBe(c1.id);
    const before = f.seen.length;
    expect(await code(r.capture(a.id, 2_000, "k-cap"))).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(f.seen.length).toBe(before);
  });

  it("gets one OAuth token and reuses it", async () => {
    const f = fakePayPal();
    const r = rail(f);
    await authorized(r);
    expect(f.seen.filter((s) => s.path === "/v1/oauth2/token")).toHaveLength(1);
    expect(f.seen.find((s) => s.path === "/v1/oauth2/token")!.body).toBe("grant_type=client_credentials");
  });

  it("without a payment source, authorize needs a buyer-approved order", async () => {
    const r = rail(fakePayPal(), { paymentSource: undefined });
    const o = await r.createOrder({ intent: "AUTHORIZE", amountCents: 500, currency: "USD", payeeId: "s", referenceId: "r" }, "k-c");
    const e = await r.authorize(o.id, "k-a").catch((x: unknown) => x);
    expect((e as PayPalApiError).issue).toBe("ORDER_NOT_APPROVED");
  });
});

describe("rail choice from the environment", () => {
  it("unset or mock → mock; sandbox → sandbox rail; anything else is refused", () => {
    expect(railFromEnv({})).toBeInstanceOf(MockPayPalRail);
    expect(railFromEnv({ PAYPAL_ENV: "mock" })).toBeInstanceOf(MockPayPalRail);
    expect(railFromEnv({ PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "a", PAYPAL_CLIENT_SECRET: "b" })).toBeInstanceOf(SandboxPayPalRail);
    expect(() => railFromEnv({ PAYPAL_ENV: "sandbox" })).toThrow(/PAYPAL_CLIENT_ID/);
    for (const v of ["live", "production", "prod"]) expect(() => railFromEnv({ PAYPAL_ENV: v, PAYPAL_CLIENT_ID: "a", PAYPAL_CLIENT_SECRET: "b" })).toThrow(/sandbox only/);
  });
});

describe("engine on the sandbox rail (offline, fake PayPal)", () => {
  it("honest delivery → capture, empty delivery → void", async () => {
    const r = rail(fakePayPal());
    const conditions = new ConditionRegistry();
    const conditionId = conditions.register(COMPANY_RECORDS);
    const engine = new PaymentEngine({ rail: r, policy: new PolicyStore(mandate({ expiresAt: Date.now() + 86_400_000 })), conditions });
    const items = [{ itemId: "i1", priceCents: 1_200 }];
    await engine.requestJob({ jobId: "j-honest", sellerId: "seller.good", items, conditionId });
    await engine.requestJob({ jobId: "j-empty", sellerId: "seller.good", items, conditionId });
    const ok = await engine.settle("j-honest", { i1: good() });
    const bad = await engine.settle("j-empty", { i1: good({ body: "" }) });
    expect(ok).toMatchObject({ status: "captured", capturedCents: 1_200 });
    expect(bad.status).toBe("voided");
    expect(((await r.get(engine.job("j-empty")!.authorizationId!)) as { status: string }).status).toBe("VOIDED");
    expect(engine.ledger.verifyChain().ok).toBe(true);
  });
});

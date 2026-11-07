import { createHash } from "node:crypto";
import {
  assertCents,
  RailError,
  type Authorization,
  type AuthorizationStatus,
  type Capture,
  type CaptureStatus,
  type Cents,
  type CreateOrderInput,
  type Currency,
  type Order,
  type PayPalRail,
  type RailErrorCode,
  type RailResource,
  type Refund,
} from "./types.js";

/**
 * PayPal sandbox rail (Orders v2 + Payments v2, intent=AUTHORIZE).
 *
 *   createOrder → POST /v2/checkout/orders                      (intent=AUTHORIZE, no payment source)
 *   authorize   → POST /v2/checkout/orders/{id}/authorize        (payment_source from config, or none after buyer approval)
 *   capture     → POST /v2/payments/authorizations/{id}/capture  (amount, final_capture)
 *   void        → POST /v2/payments/authorizations/{id}/void
 *   refund      → POST /v2/payments/captures/{id}/refund
 *   get         → GET  /v2/checkout/orders/{id} | /v2/payments/{authorizations|captures|refunds}/{id}
 *
 * Every POST sends the caller's requestId as the PayPal-Request-Id header, including retries.
 * Credentials are passed in by the caller. This module never reads files or env, and never
 * puts a credential or token into an error, a log line or a returned value.
 * Only the sandbox host is accepted; any other base URL is refused at construction.
 */
export const SANDBOX_HOST = "api-m.sandbox.paypal.com";
const SANDBOX_BASE = `https://${SANDBOX_HOST}`;

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

/** A PayPal payment_source object for the authorize call (card, card.vault_id, token …). */
export type PaymentSource = Record<string, unknown>;

export interface SandboxRailConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
  /**
   * Sent in the authorize body. With a card (or a vaulted card's vault_id) no buyer login is needed.
   * Leave it out for orders a buyer approved through the approve link.
   */
  paymentSource?: PaymentSource;
  /** Injected for offline tests. Defaults to global fetch. */
  fetch?: FetchLike;
  /** Retries on network errors and 5xx, always with the same PayPal-Request-Id. Default 2. */
  retries?: number;
}

/** A PayPal API error. `issue` is PayPal's own issue name (e.g. AUTHORIZATION_VOIDED). */
export class PayPalApiError extends RailError {
  constructor(
    code: RailErrorCode,
    public readonly httpStatus: number,
    public readonly issue: string,
    public readonly debugId: string | null,
    detail: string,
  ) {
    super(code, `${issue} (http ${httpStatus}${debugId ? `, debug_id ${debugId}` : ""})${detail ? `: ${detail}` : ""}`);
    this.name = "PayPalApiError";
  }
}

const ISSUE_TO_CODE: Record<string, RailErrorCode> = {
  AUTHORIZATION_VOIDED: "AUTHORIZATION_VOIDED",
  PREVIOUSLY_VOIDED: "AUTHORIZATION_VOIDED",
  AUTHORIZATION_EXPIRED: "AUTHORIZATION_EXPIRED",
  AUTHORIZATION_ALREADY_CAPTURED: "AUTHORIZATION_ALREADY_CAPTURED",
  PREVIOUSLY_CAPTURED: "AUTHORIZATION_ALREADY_CAPTURED",
  CANNOT_BE_VOIDED: "AUTHORIZATION_ALREADY_CAPTURED",
  MAX_CAPTURE_AMOUNT_EXCEEDED: "MAX_CAPTURE_AMOUNT_EXCEEDED",
  MAX_CAPTURE_COUNT_EXCEEDED: "MAX_CAPTURE_AMOUNT_EXCEEDED",
  REFUND_AMOUNT_EXCEEDED: "REFUND_AMOUNT_EXCEEDED",
  CAPTURE_FULLY_REFUNDED: "REFUND_AMOUNT_EXCEEDED",
  ORDER_ALREADY_AUTHORIZED: "ORDER_ALREADY_AUTHORIZED",
  ORDER_ALREADY_COMPLETED: "ORDER_ALREADY_AUTHORIZED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  INVALID_RESOURCE_ID: "RESOURCE_NOT_FOUND",
  CANNOT_BE_ZERO_OR_NEGATIVE: "INVALID_AMOUNT",
  DECIMAL_PRECISION: "INVALID_AMOUNT",
  AMOUNT_MISMATCH: "INVALID_AMOUNT",
};

type Kind = RailResource["kind"];
const PATHS: Record<Kind, string> = {
  order: "/v2/checkout/orders",
  authorization: "/v2/payments/authorizations",
  capture: "/v2/payments/captures",
  refund: "/v2/payments/refunds",
};

/** Integer cents → "12.34". */
export function centsToValue(cents: Cents): string {
  assertCents(cents);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** "12.34" → 1234, parsed as text (no float on the way). */
export function valueToCents(value: unknown): Cents {
  const m = typeof value === "string" ? /^(\d+)(?:\.(\d{1,2}))?$/.exec(value) : null;
  if (!m) throw new RailError("INVALID_AMOUNT", `unexpected amount value from PayPal: ${String(value)}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

type J = Record<string, any>; // PayPal JSON, read defensively below

export class SandboxPayPalRail implements PayPalRail {
  readonly name = "paypal-sandbox";
  readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly retries: number;
  private token: { value: string; expiresAt: number } | null = null;
  private readonly kinds = new Map<string, Kind>();
  private readonly fingerprints = new Map<string, string>();

  constructor(private readonly config: SandboxRailConfig) {
    const base = (config.baseUrl ?? SANDBOX_BASE).replace(/\/+$/, "");
    let host = "";
    try {
      const u = new URL(base);
      host = u.protocol === "https:" ? u.host : "";
    } catch {
      host = "";
    }
    if (host !== SANDBOX_HOST) throw new Error(`sandbox rail only talks to https://${SANDBOX_HOST}`);
    if (!config.clientId || !config.clientSecret) throw new Error("sandbox rail needs a client id and secret");
    this.baseUrl = base;
    this.fetchImpl = config.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.retries = config.retries ?? 2;
  }

  // ------------------------------------------------------------------ PayPalRail

  async createOrder(input: CreateOrderInput, requestId: string): Promise<Order> {
    if (input.intent !== "AUTHORIZE") throw new RailError("INVALID_AMOUNT", "only intent=AUTHORIZE is supported");
    assertCents(input.amountCents);
    const raw = await this.post("createOrder", PATHS.order, requestId, this.orderBody(input));
    return this.toOrder(raw);
  }

  /**
   * PayPal-balance path: create the order and return the link a buyer must open to approve it.
   * After approval, call authorize() on a rail configured without a paymentSource.
   */
  async createOrderForBuyerApproval(
    input: CreateOrderInput,
    requestId: string,
    urls: { returnUrl: string; cancelUrl: string },
  ): Promise<{ order: Order; approveUrl: string }> {
    assertCents(input.amountCents);
    const body = {
      ...this.orderBody(input),
      payment_source: {
        paypal: {
          experience_context: { return_url: urls.returnUrl, cancel_url: urls.cancelUrl, user_action: "CONTINUE", shipping_preference: "NO_SHIPPING" },
        },
      },
    };
    const raw = await this.post("createOrderForBuyerApproval", PATHS.order, requestId, body);
    const link = (raw.links as J[] | undefined)?.find((l) => l.rel === "payer-action" || l.rel === "approve");
    if (!link?.href) throw new PayPalApiError("PAYPAL_ERROR", 200, "NO_APPROVE_LINK", raw.debug_id ?? null, "order has no approve link");
    return { order: this.toOrder(raw), approveUrl: String(link.href) };
  }

  async authorize(orderId: string, requestId: string, opts?: { buyerApproved?: boolean }): Promise<Authorization> {
    const body = opts?.buyerApproved || !this.config.paymentSource ? {} : { payment_source: this.config.paymentSource };
    const raw = await this.post("authorize", `${PATHS.order}/${enc(orderId)}/authorize`, requestId, body);
    this.remember(raw.id, "order");
    const a = (raw.purchase_units as J[] | undefined)?.[0]?.payments?.authorizations?.[0] as J | undefined;
    if (!a?.id) throw new PayPalApiError("PAYPAL_ERROR", 200, "NO_AUTHORIZATION", raw.debug_id ?? null, `order ${orderId}`);
    if (a.status === "DENIED") throw new PayPalApiError("PAYPAL_ERROR", 200, "AUTHORIZATION_DENIED", null, String(a.id));
    this.remember(a.id, "authorization");
    return this.toAuthorization(a, orderId, []);
  }

  async capture(
    authorizationId: string,
    amountCents: Cents,
    requestId: string,
    opts: { finalCapture?: boolean } = {},
  ): Promise<Capture> {
    assertCents(amountCents);
    const finalCapture = opts.finalCapture ?? true;
    const raw = await this.post("capture", `${PATHS.authorization}/${enc(authorizationId)}/capture`, requestId, {
      amount: { currency_code: "USD", value: centsToValue(amountCents) },
      final_capture: finalCapture,
    });
    if (raw.status === "DECLINED" || raw.status === "FAILED") {
      throw new PayPalApiError("PAYPAL_ERROR", 201, `CAPTURE_${raw.status}`, null, String(raw.id));
    }
    this.remember(raw.id, "capture");
    return this.toCapture(raw, authorizationId, 0);
  }

  async void(authorizationId: string, requestId: string): Promise<Authorization> {
    await this.post("void", `${PATHS.authorization}/${enc(authorizationId)}/void`, requestId, {});
    return this.getAuthorization(authorizationId);
  }

  async refund(captureId: string, amountCents: Cents, requestId: string): Promise<Refund> {
    assertCents(amountCents);
    const raw = await this.post("refund", `${PATHS.capture}/${enc(captureId)}/refund`, requestId, {
      amount: { currency_code: "USD", value: centsToValue(amountCents) },
    });
    this.remember(raw.id, "refund");
    return this.toRefund(raw, captureId);
  }

  async get(id: string): Promise<RailResource> {
    const known = this.kinds.get(id);
    const order: Kind[] = known ? [known] : ["order", "authorization", "capture", "refund"];
    for (const kind of order) {
      try {
        const r = await this.getAs(kind, id);
        this.remember(id, kind);
        return r;
      } catch (e) {
        if (e instanceof RailError && e.code === "RESOURCE_NOT_FOUND" && !known) continue;
        throw e;
      }
    }
    throw new RailError("RESOURCE_NOT_FOUND", id);
  }

  // ------------------------------------------------------------------ raw reads (for records)

  /** The PayPal object exactly as the API returns it (for docs/sandbox-run.json). */
  async getRaw(kind: Kind, id: string): Promise<J> {
    return this.call("GET", `${PATHS[kind]}/${enc(id)}`);
  }

  /** Any sandbox call, through the same token, host guard and error mapping. */
  async request(method: "GET" | "POST" | "DELETE", path: string, opts: { body?: unknown; requestId?: string } = {}): Promise<J> {
    if (!path.startsWith("/")) throw new Error("path must start with /");
    return this.call(method, path, opts.body, opts.requestId);
  }

  // ------------------------------------------------------------------ mapping

  private async getAs(kind: Kind, id: string): Promise<RailResource> {
    switch (kind) {
      case "order":
        return this.toOrder(await this.getRaw("order", id));
      case "authorization":
        return this.getAuthorization(id);
      case "capture": {
        const raw = await this.getRaw("capture", id);
        const authId = raw.supplementary_data?.related_ids?.authorization_id ?? "";
        const orderId = raw.supplementary_data?.related_ids?.order_id;
        let refunded = 0;
        if (orderId) {
          const o = await this.getRaw("order", orderId);
          refunded = paymentsOf(o).refunds
            .filter((r) => r.status !== "CANCELLED" && r.status !== "FAILED" && upId(r) === id)
            .reduce((s, r) => s + valueToCents(r.amount?.value), 0);
        }
        return this.toCapture(raw, String(authId), refunded);
      }
      case "refund": {
        const raw = await this.getRaw("refund", id);
        return this.toRefund(raw, upId(raw) ?? "");
      }
    }
  }

  private async getAuthorization(id: string): Promise<Authorization> {
    const raw = await this.getRaw("authorization", id);
    const orderId = String(raw.supplementary_data?.related_ids?.order_id ?? "");
    let captures: J[] = [];
    if (orderId) {
      const o = await this.getRaw("order", orderId);
      captures = paymentsOf(o).captures.filter((c) => c.status !== "DECLINED" && c.status !== "FAILED" && upId(c, "authorizations") === id);
    }
    return this.toAuthorization(raw, orderId, captures);
  }

  private orderBody(input: CreateOrderInput): J {
    return {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          // payeeId is the vet402 seller id, not a PayPal account; it rides along in custom_id.
          custom_id: input.payeeId,
          amount: { currency_code: input.currency, value: centsToValue(input.amountCents) },
        },
      ],
    };
  }

  private toOrder(raw: J): Order {
    this.remember(raw.id, "order");
    const pu = (raw.purchase_units as J[] | undefined)?.[0] ?? {};
    return {
      kind: "order",
      id: String(raw.id),
      status: raw.status === "COMPLETED" ? "COMPLETED" : "CREATED",
      intent: "AUTHORIZE",
      amountCents: valueToCents(pu.amount?.value),
      currency: currency(pu.amount?.currency_code),
      payeeId: String(pu.custom_id ?? ""),
      referenceId: String(pu.reference_id ?? ""),
      authorizationId: pu.payments?.authorizations?.[0]?.id ?? null,
      createdAt: time(raw.create_time),
    };
  }

  private toAuthorization(raw: J, orderId: string, captures: J[]): Authorization {
    const status = authStatus(raw.status);
    return {
      kind: "authorization",
      id: String(raw.id),
      orderId: String(raw.supplementary_data?.related_ids?.order_id ?? orderId),
      status,
      amountCents: valueToCents(raw.amount?.value),
      currency: currency(raw.amount?.currency_code),
      capturedCents: captures.reduce((s, c) => s + valueToCents(c.amount?.value), 0),
      createdAt: time(raw.create_time),
      expiresAt: time(raw.expiration_time),
      captureIds: captures.map((c) => String(c.id)),
    };
  }

  private toCapture(raw: J, authorizationId: string, refundedCents: Cents): Capture {
    return {
      kind: "capture",
      id: String(raw.id),
      authorizationId: String(raw.supplementary_data?.related_ids?.authorization_id ?? authorizationId),
      status: captureStatus(raw.status),
      amountCents: valueToCents(raw.amount?.value),
      currency: currency(raw.amount?.currency_code),
      finalCapture: raw.final_capture !== false,
      refundedCents,
      createdAt: time(raw.create_time),
    };
  }

  private toRefund(raw: J, captureId: string): Refund {
    return {
      kind: "refund",
      id: String(raw.id),
      captureId: upId(raw) ?? captureId,
      amountCents: valueToCents(raw.amount?.value),
      currency: currency(raw.amount?.currency_code),
      createdAt: time(raw.create_time),
    };
  }

  private remember(id: unknown, kind: Kind): void {
    if (typeof id === "string" && id) this.kinds.set(id, kind);
  }

  // ------------------------------------------------------------------ transport

  private async post(op: string, path: string, requestId: string, body: unknown): Promise<J> {
    if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 108) {
      throw new RailError("IDEMPOTENCY_KEY_REUSED", "PayPal-Request-Id is required (1–108 chars)");
    }
    // PayPal answers a reused id with the first result whatever the payload; refuse a changed payload here.
    const fp = createHash("sha256").update(`${op}:${path}:${JSON.stringify(body)}`).digest("hex");
    const seen = this.fingerprints.get(requestId);
    if (seen && seen !== fp) throw new RailError("IDEMPOTENCY_KEY_REUSED", `request id ${requestId} was used for a different request`);
    this.fingerprints.set(requestId, fp);
    return this.call("POST", path, body, requestId);
  }

  private async call(method: string, path: string, body?: unknown, requestId?: string): Promise<J> {
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };
      if (requestId) headers["PayPal-Request-Id"] = requestId;
      let res: { status: number; text(): Promise<string> };
      try {
        res = await this.fetchImpl(this.baseUrl + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      } catch (e) {
        if (attempt < this.retries) continue;
        throw new PayPalApiError("PAYPAL_ERROR", 0, "NETWORK_ERROR", null, e instanceof Error ? e.message : "fetch failed");
      }
      if (res.status === 401 && attempt < this.retries) {
        this.token = null;
        continue;
      }
      if (res.status >= 500 && attempt < this.retries) continue;
      const text = await res.text();
      const json: J = text ? safeJson(text) : {};
      if (res.status >= 200 && res.status < 300) return json;
      throw toError(res.status, json);
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    let res: { status: number; text(): Promise<string> };
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
    } catch (e) {
      throw new PayPalApiError("PAYPAL_ERROR", 0, "NETWORK_ERROR", null, e instanceof Error ? e.message : "fetch failed");
    }
    const json = safeJson(await res.text());
    if (res.status !== 200 || typeof json.access_token !== "string") {
      // Never echo the response body: on some errors it repeats request details.
      throw new PayPalApiError("PAYPAL_ERROR", res.status, String(json.error ?? "OAUTH_FAILED"), null, "could not get a sandbox access token");
    }
    const ttl = Number(json.expires_in) > 0 ? Number(json.expires_in) : 300;
    this.token = { value: json.access_token, expiresAt: Date.now() + Math.max(30, ttl - 60) * 1000 };
    return this.token.value;
  }
}

// ------------------------------------------------------------------ helpers

function enc(id: string): string {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new RailError("RESOURCE_NOT_FOUND", `not a PayPal id: ${String(id)}`);
  return id;
}

function safeJson(text: string): J {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function toError(status: number, json: J): PayPalApiError {
  const issue = String(json.details?.[0]?.issue ?? json.name ?? (status === 404 ? "RESOURCE_NOT_FOUND" : `HTTP_${status}`));
  const code = ISSUE_TO_CODE[issue] ?? (status === 404 ? "RESOURCE_NOT_FOUND" : "PAYPAL_ERROR");
  const detail = String(json.details?.[0]?.description ?? json.message ?? "").slice(0, 300);
  return new PayPalApiError(code, status, issue, typeof json.debug_id === "string" ? json.debug_id : null, detail);
}

function paymentsOf(order: J): { captures: J[]; refunds: J[] } {
  const p = (order.purchase_units as J[] | undefined)?.[0]?.payments ?? {};
  return { captures: (p.captures as J[] | undefined) ?? [], refunds: (p.refunds as J[] | undefined) ?? [] };
}

/** The id in a resource's rel=up link (refund → capture, capture → authorization). */
function upId(r: J, collection = "captures"): string | undefined {
  const href = (r.links as J[] | undefined)?.find((l) => l.rel === "up")?.href;
  const m = typeof href === "string" ? new RegExp(`/${collection}/([A-Za-z0-9_-]+)`).exec(href) : null;
  if (m) return m[1];
  if (collection === "authorizations") return r.supplementary_data?.related_ids?.authorization_id;
  return undefined;
}

function time(v: unknown): number {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function currency(v: unknown): Currency {
  if (v !== "USD") throw new RailError("INVALID_AMOUNT", `unexpected currency ${String(v)}`);
  return "USD";
}

function authStatus(s: unknown): AuthorizationStatus {
  switch (s) {
    case "CAPTURED":
    case "PARTIALLY_CAPTURED":
    case "VOIDED":
    case "EXPIRED":
    case "CREATED":
      return s;
    case "PENDING": // under review at PayPal; still capturable later
      return "CREATED";
    default:
      throw new PayPalApiError("PAYPAL_ERROR", 200, `AUTHORIZATION_${String(s)}`, null, "unexpected authorization status");
  }
}

function captureStatus(s: unknown): CaptureStatus {
  switch (s) {
    case "COMPLETED":
    case "PARTIALLY_REFUNDED":
    case "REFUNDED":
      return s;
    case "PENDING": // funds held by PayPal; the capture exists and counts as captured
      return "COMPLETED";
    default:
      throw new PayPalApiError("PAYPAL_ERROR", 200, `CAPTURE_${String(s)}`, null, "unexpected capture status");
  }
}

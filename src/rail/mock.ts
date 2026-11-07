import { createHash } from "node:crypto";
import {
  assertCents,
  RailError,
  type Authorization,
  type Capture,
  type Cents,
  type CreateOrderInput,
  type Order,
  type PayPalRail,
  type RailResource,
  type Refund,
} from "./types.js";

/** PayPal authorizations stay valid for 29 days (honor period 3 days). */
export const DEFAULT_AUTH_VALIDITY_MS = 29 * 24 * 60 * 60 * 1000;

export interface MockRailOptions {
  now?: () => number;
  authValidityMs?: number;
}

type Op = "createOrder" | "authorize" | "capture" | "void" | "refund";

interface StoredResult {
  op: Op;
  fingerprint: string;
  outcome: { ok: true; value: RailResource } | { ok: false; error: RailError };
}

export interface RailCall {
  op: Op | "get";
  requestId: string | null;
  /** true when the call was answered from the idempotency store (no effect). */
  replayed: boolean;
}

/**
 * In-memory PayPal rail. No network, no keys.
 * Reproduces: authorization expiry, double-capture refusal,
 * capture-after-void refusal, refund ceilings, and PayPal-Request-Id replay.
 */
export class MockPayPalRail implements PayPalRail {
  readonly name = "mock";
  readonly calls: RailCall[] = [];
  private readonly now: () => number;
  private readonly authValidityMs: number;
  private readonly resources = new Map<string, RailResource>();
  private readonly idempotency = new Map<string, StoredResult>();
  private seq = 0;

  constructor(opts: MockRailOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
    this.authValidityMs = opts.authValidityMs ?? DEFAULT_AUTH_VALIDITY_MS;
  }

  /** Number of calls for an operation that actually took effect. */
  effectiveCalls(op: Op): number {
    return this.calls.filter((c) => c.op === op && !c.replayed).length;
  }

  /** Number of calls for an operation, including replays. */
  callCount(op?: Op | "get"): number {
    return op ? this.calls.filter((c) => c.op === op).length : this.calls.length;
  }

  async createOrder(input: CreateOrderInput, requestId: string): Promise<Order> {
    return this.idempotent("createOrder", requestId, input, () => {
      if (input.intent !== "AUTHORIZE") throw new RailError("INVALID_AMOUNT", "only intent=AUTHORIZE is supported");
      assertCents(input.amountCents);
      const order: Order = {
        kind: "order",
        id: this.id("ORDER"),
        status: "CREATED",
        intent: "AUTHORIZE",
        amountCents: input.amountCents,
        currency: input.currency,
        payeeId: input.payeeId,
        referenceId: input.referenceId,
        authorizationId: null,
        createdAt: this.now(),
      };
      this.resources.set(order.id, order);
      return order;
    });
  }

  async authorize(orderId: string, requestId: string): Promise<Authorization> {
    return this.idempotent("authorize", requestId, { orderId }, () => {
      const order = this.mustGet(orderId, "order");
      if (order.authorizationId) throw new RailError("ORDER_ALREADY_AUTHORIZED", orderId);
      const t = this.now();
      const auth: Authorization = {
        kind: "authorization",
        id: this.id("AUTH"),
        orderId,
        status: "CREATED",
        amountCents: order.amountCents,
        currency: order.currency,
        capturedCents: 0,
        createdAt: t,
        expiresAt: t + this.authValidityMs,
        captureIds: [],
      };
      order.status = "COMPLETED";
      order.authorizationId = auth.id;
      this.resources.set(auth.id, auth);
      return auth;
    });
  }

  async capture(
    authorizationId: string,
    amountCents: Cents,
    requestId: string,
    opts: { finalCapture?: boolean } = {},
  ): Promise<Capture> {
    const finalCapture = opts.finalCapture ?? true;
    return this.idempotent("capture", requestId, { authorizationId, amountCents, finalCapture }, () => {
      assertCents(amountCents);
      const auth = this.mustGet(authorizationId, "authorization");
      this.refreshExpiry(auth);
      if (auth.status === "VOIDED") throw new RailError("AUTHORIZATION_VOIDED", authorizationId);
      if (auth.status === "EXPIRED") throw new RailError("AUTHORIZATION_EXPIRED", authorizationId);
      if (auth.status === "CAPTURED") throw new RailError("AUTHORIZATION_ALREADY_CAPTURED", authorizationId);
      if (auth.capturedCents + amountCents > auth.amountCents) {
        throw new RailError(
          "MAX_CAPTURE_AMOUNT_EXCEEDED",
          `capture ${amountCents} + captured ${auth.capturedCents} > authorized ${auth.amountCents}`,
        );
      }
      const cap: Capture = {
        kind: "capture",
        id: this.id("CAP"),
        authorizationId,
        status: "COMPLETED",
        amountCents,
        currency: auth.currency,
        finalCapture,
        refundedCents: 0,
        createdAt: this.now(),
      };
      auth.capturedCents += amountCents;
      auth.captureIds.push(cap.id);
      // final_capture=true closes the authorization; the uncaptured rest is released.
      auth.status = finalCapture || auth.capturedCents === auth.amountCents ? "CAPTURED" : "PARTIALLY_CAPTURED";
      this.resources.set(cap.id, cap);
      return cap;
    });
  }

  async void(authorizationId: string, requestId: string): Promise<Authorization> {
    return this.idempotent("void", requestId, { authorizationId }, () => {
      const auth = this.mustGet(authorizationId, "authorization");
      this.refreshExpiry(auth);
      if (auth.status === "EXPIRED") throw new RailError("AUTHORIZATION_EXPIRED", authorizationId);
      if (auth.status === "VOIDED") throw new RailError("AUTHORIZATION_VOIDED", authorizationId);
      if (auth.status === "CAPTURED" || auth.status === "PARTIALLY_CAPTURED") {
        throw new RailError("AUTHORIZATION_ALREADY_CAPTURED", `${authorizationId} has captures; refund instead`);
      }
      auth.status = "VOIDED";
      return auth;
    });
  }

  async refund(captureId: string, amountCents: Cents, requestId: string): Promise<Refund> {
    return this.idempotent("refund", requestId, { captureId, amountCents }, () => {
      assertCents(amountCents);
      const cap = this.mustGet(captureId, "capture");
      if (cap.refundedCents + amountCents > cap.amountCents) {
        throw new RailError(
          "REFUND_AMOUNT_EXCEEDED",
          `refund ${amountCents} + refunded ${cap.refundedCents} > captured ${cap.amountCents}`,
        );
      }
      const ref: Refund = {
        kind: "refund",
        id: this.id("REF"),
        captureId,
        amountCents,
        currency: cap.currency,
        createdAt: this.now(),
      };
      cap.refundedCents += amountCents;
      cap.status = cap.refundedCents === cap.amountCents ? "REFUNDED" : "PARTIALLY_REFUNDED";
      this.resources.set(ref.id, ref);
      return ref;
    });
  }

  async get(id: string): Promise<RailResource> {
    this.calls.push({ op: "get", requestId: null, replayed: false });
    const r = this.resources.get(id);
    if (!r) throw new RailError("RESOURCE_NOT_FOUND", id);
    if (r.kind === "authorization") this.refreshExpiry(r);
    return structuredClone(r);
  }

  private refreshExpiry(auth: Authorization): void {
    if ((auth.status === "CREATED" || auth.status === "PARTIALLY_CAPTURED") && this.now() >= auth.expiresAt) {
      auth.status = "EXPIRED";
    }
  }

  private mustGet<K extends RailResource["kind"]>(id: string, kind: K): Extract<RailResource, { kind: K }> {
    const r = this.resources.get(id);
    if (!r || r.kind !== kind) throw new RailError("RESOURCE_NOT_FOUND", `${kind} ${id}`);
    return r as Extract<RailResource, { kind: K }>;
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-MOCK-${String(this.seq).padStart(6, "0")}`;
  }

  /**
   * Same requestId + same op + same payload → stored result (success or error), no effect.
   * Same requestId with a different op or payload → IDEMPOTENCY_KEY_REUSED.
   */
  private idempotent<T extends RailResource>(op: Op, requestId: string, payload: unknown, run: () => T): Promise<T> {
    if (typeof requestId !== "string" || requestId.length === 0) {
      return Promise.reject(new RailError("IDEMPOTENCY_KEY_REUSED", "PayPal-Request-Id is required"));
    }
    const fingerprint = createHash("sha256").update(`${op}:${JSON.stringify(payload)}`).digest("hex");
    const stored = this.idempotency.get(requestId);
    if (stored) {
      this.calls.push({ op, requestId, replayed: true });
      if (stored.op !== op || stored.fingerprint !== fingerprint) {
        return Promise.reject(
          new RailError("IDEMPOTENCY_KEY_REUSED", `request id ${requestId} was used for a different request`),
        );
      }
      if (stored.outcome.ok) return Promise.resolve(structuredClone(stored.outcome.value) as T);
      return Promise.reject(stored.outcome.error);
    }
    this.calls.push({ op, requestId, replayed: false });
    try {
      const value = run();
      this.idempotency.set(requestId, { op, fingerprint, outcome: { ok: true, value: structuredClone(value) } });
      return Promise.resolve(structuredClone(value));
    } catch (e) {
      if (e instanceof RailError) {
        this.idempotency.set(requestId, { op, fingerprint, outcome: { ok: false, error: e } });
      }
      return Promise.reject(e);
    }
  }
}

import {
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

/**
 * PayPal sandbox rail — frame only, filled on 11/8.
 *
 * Base URL: https://api-m.sandbox.paypal.com
 *   createOrder → POST /v2/checkout/orders                      (intent=AUTHORIZE)
 *   authorize   → POST /v2/checkout/orders/{id}/authorize
 *   capture     → POST /v2/payments/authorizations/{id}/capture  (amount, final_capture)
 *   void        → POST /v2/payments/authorizations/{id}/void
 *   refund      → POST /v2/payments/captures/{id}/refund
 *   get         → GET  /v2/checkout/orders/{id} | /v2/payments/{authorizations|captures|refunds}/{id}
 * Every POST sends the caller's requestId as the PayPal-Request-Id header.
 *
 * Credentials are passed in by the caller. This module never reads files or env.
 */
export interface SandboxRailConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

export class SandboxPayPalRail implements PayPalRail {
  readonly name = "paypal-sandbox";
  readonly baseUrl: string;

  constructor(private readonly config: SandboxRailConfig) {
    this.baseUrl = config.baseUrl ?? "https://api-m.sandbox.paypal.com";
  }

  createOrder(_input: CreateOrderInput, _requestId: string): Promise<Order> {
    return notYet("createOrder");
  }
  authorize(_orderId: string, _requestId: string): Promise<Authorization> {
    return notYet("authorize");
  }
  capture(
    _authorizationId: string,
    _amountCents: Cents,
    _requestId: string,
    _opts?: { finalCapture?: boolean },
  ): Promise<Capture> {
    return notYet("capture");
  }
  void(_authorizationId: string, _requestId: string): Promise<Authorization> {
    return notYet("void");
  }
  refund(_captureId: string, _amountCents: Cents, _requestId: string): Promise<Refund> {
    return notYet("refund");
  }
  get(_id: string): Promise<RailResource> {
    return notYet("get");
  }
}

function notYet<T>(op: string): Promise<T> {
  return Promise.reject(new RailError("NOT_IMPLEMENTED", `sandbox ${op} is wired on 11/8`));
}

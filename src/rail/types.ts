/**
 * PayPal rail contract (Orders v2 + Payments v2, intent=AUTHORIZE).
 *
 * Every mutating call takes a PayPal-Request-Id. Retrying with the same id
 * and the same payload returns the same result and never repeats the effect.
 * Amounts are integer cents. Nothing in this module accepts a float.
 */

export type Cents = number;
export type Currency = "USD";

export interface CreateOrderInput {
  intent: "AUTHORIZE";
  amountCents: Cents;
  currency: Currency;
  payeeId: string;
  /** Free-form reference echoed back (PayPal: purchase_units[].reference_id). */
  referenceId: string;
}

export type OrderStatus = "CREATED" | "COMPLETED";
export type AuthorizationStatus =
  | "CREATED"
  | "CAPTURED"
  | "PARTIALLY_CAPTURED"
  | "VOIDED"
  | "EXPIRED";
export type CaptureStatus = "COMPLETED" | "PARTIALLY_REFUNDED" | "REFUNDED";

export interface Order {
  kind: "order";
  id: string;
  status: OrderStatus;
  intent: "AUTHORIZE";
  amountCents: Cents;
  currency: Currency;
  payeeId: string;
  referenceId: string;
  authorizationId: string | null;
  createdAt: number;
}

export interface Authorization {
  kind: "authorization";
  id: string;
  orderId: string;
  status: AuthorizationStatus;
  amountCents: Cents;
  currency: Currency;
  capturedCents: Cents;
  createdAt: number;
  expiresAt: number;
  captureIds: string[];
}

export interface Capture {
  kind: "capture";
  id: string;
  authorizationId: string;
  status: CaptureStatus;
  amountCents: Cents;
  currency: Currency;
  finalCapture: boolean;
  refundedCents: Cents;
  createdAt: number;
}

export interface Refund {
  kind: "refund";
  id: string;
  captureId: string;
  amountCents: Cents;
  currency: Currency;
  createdAt: number;
}

export type RailResource = Order | Authorization | Capture | Refund;

/** Error codes mirror PayPal issue names where one exists. */
export type RailErrorCode =
  | "INVALID_AMOUNT"
  | "RESOURCE_NOT_FOUND"
  | "ORDER_ALREADY_AUTHORIZED"
  | "AUTHORIZATION_EXPIRED"
  | "AUTHORIZATION_VOIDED"
  | "AUTHORIZATION_ALREADY_CAPTURED"
  | "MAX_CAPTURE_AMOUNT_EXCEEDED"
  | "REFUND_AMOUNT_EXCEEDED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "NOT_IMPLEMENTED"
  /** Any other PayPal API error; the PayPal issue name is in the message (sandbox rail only). */
  | "PAYPAL_ERROR";

export class RailError extends Error {
  constructor(
    public readonly code: RailErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "RailError";
  }
}

export interface PayPalRail {
  readonly name: string;
  createOrder(input: CreateOrderInput, requestId: string): Promise<Order>;
  authorize(orderId: string, requestId: string): Promise<Authorization>;
  capture(
    authorizationId: string,
    amountCents: Cents,
    requestId: string,
    opts?: { finalCapture?: boolean },
  ): Promise<Capture>;
  void(authorizationId: string, requestId: string): Promise<Authorization>;
  refund(captureId: string, amountCents: Cents, requestId: string): Promise<Refund>;
  get(id: string): Promise<RailResource>;
}

export function assertCents(value: unknown, label = "amount"): asserts value is Cents {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new RailError("INVALID_AMOUNT", `${label} must be a positive integer of cents, got ${String(value)}`);
  }
}

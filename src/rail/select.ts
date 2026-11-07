import { MockPayPalRail } from "./mock.js";
import { SandboxPayPalRail, type PaymentSource, type SandboxRailConfig } from "./sandbox.js";
import type { PayPalRail } from "./types.js";

/**
 * A public PayPal sandbox test card (developer.paypal.com/tools/sandbox/card-testing/).
 * It only works against the sandbox host. Authorizing with it needs no buyer login.
 */
export const SANDBOX_TEST_CARD: PaymentSource = {
  card: { number: "4012888888881881", expiry: "2030-12", security_code: "123", name: "Sandbox Buyer" },
};

export interface RailEnv {
  [key: string]: string | undefined;
  PAYPAL_ENV?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
}

/**
 * PAYPAL_ENV=sandbox → the real PayPal sandbox (keys from the environment, test card by default).
 * PAYPAL_ENV unset or "mock" → the in-memory mock. Anything else (live, production …) is refused.
 */
export function railFromEnv(env: RailEnv = process.env, over: Partial<SandboxRailConfig> = {}): PayPalRail {
  const mode = (env.PAYPAL_ENV ?? "mock").trim().toLowerCase();
  if (mode === "mock" || mode === "") return new MockPayPalRail();
  if (mode !== "sandbox") throw new Error(`PAYPAL_ENV=${mode} is not supported; this build talks to the PayPal sandbox only`);
  const clientId = env.PAYPAL_CLIENT_ID ?? "";
  const clientSecret = env.PAYPAL_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) throw new Error("PAYPAL_ENV=sandbox needs PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET");
  return new SandboxPayPalRail({ clientId, clientSecret, paymentSource: SANDBOX_TEST_CARD, ...over });
}

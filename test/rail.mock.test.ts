import { describe, expect, it } from "vitest";
import { MockPayPalRail } from "../src/rail/mock.js";
import { SandboxPayPalRail } from "../src/rail/sandbox.js";
import { RailError } from "../src/rail/types.js";
import { clock, DAY } from "./helpers.js";

async function authorized(rail: MockPayPalRail, cents = 5_000) {
  const o = await rail.createOrder({ intent: "AUTHORIZE", amountCents: cents, currency: "USD", payeeId: "s", referenceId: "r" }, "k-create");
  return rail.authorize(o.id, "k-auth");
}

const code = (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof RailError ? e.code : String(e)));

describe("mock PayPal rail", () => {
  it("same PayPal-Request-Id on capture twice → one capture, same result", async () => {
    const rail = new MockPayPalRail();
    const a = await authorized(rail);
    const c1 = await rail.capture(a.id, 3_000, "k-cap");
    const c2 = await rail.capture(a.id, 3_000, "k-cap");
    expect(c2.id).toBe(c1.id);
    expect(rail.effectiveCalls("capture")).toBe(1);
    expect(((await rail.get(a.id)) as { capturedCents: number }).capturedCents).toBe(3_000);
  });

  it("reusing a request id for a different payload is refused", async () => {
    const rail = new MockPayPalRail();
    const a = await authorized(rail);
    await rail.capture(a.id, 1_000, "k-cap");
    expect(await code(rail.capture(a.id, 2_000, "k-cap"))).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("second capture with a new request id is refused (double capture)", async () => {
    const rail = new MockPayPalRail();
    const a = await authorized(rail);
    await rail.capture(a.id, 5_000, "k-cap-1");
    expect(await code(rail.capture(a.id, 1, "k-cap-2"))).toBe("AUTHORIZATION_ALREADY_CAPTURED");
  });

  it("capture after void is refused", async () => {
    const rail = new MockPayPalRail();
    const a = await authorized(rail);
    await rail.void(a.id, "k-void");
    expect(await code(rail.capture(a.id, 1_000, "k-cap"))).toBe("AUTHORIZATION_VOIDED");
  });

  it("capture after the authorization expired is refused", async () => {
    const c = clock();
    const rail = new MockPayPalRail({ now: c.now });
    const a = await authorized(rail);
    c.advance(29 * DAY);
    expect(await code(rail.capture(a.id, 1_000, "k-cap"))).toBe("AUTHORIZATION_EXPIRED");
    expect(((await rail.get(a.id)) as { status: string }).status).toBe("EXPIRED");
  });

  it("capture above the authorized amount is refused; less than authorized closes it", async () => {
    const rail = new MockPayPalRail();
    const a = await authorized(rail, 5_000);
    expect(await code(rail.capture(a.id, 5_001, "k-over"))).toBe("MAX_CAPTURE_AMOUNT_EXCEEDED");
    const cap = await rail.capture(a.id, 2_000, "k-part", { finalCapture: true });
    expect(cap.amountCents).toBe(2_000);
    expect(((await rail.get(a.id)) as { status: string }).status).toBe("CAPTURED");
  });

  it("refund cannot exceed the capture; refund is idempotent", async () => {
    const rail = new MockPayPalRail();
    const a = await authorized(rail);
    const cap = await rail.capture(a.id, 3_000, "k-cap");
    const r1 = await rail.refund(cap.id, 1_000, "k-ref");
    const r2 = await rail.refund(cap.id, 1_000, "k-ref");
    expect(r2.id).toBe(r1.id);
    expect(await code(rail.refund(cap.id, 2_001, "k-ref-2"))).toBe("REFUND_AMOUNT_EXCEEDED");
  });

  it("rejects non-integer amounts", async () => {
    const rail = new MockPayPalRail();
    expect(await code(rail.createOrder({ intent: "AUTHORIZE", amountCents: 19.99, currency: "USD", payeeId: "s", referenceId: "r" }, "k"))).toBe("INVALID_AMOUNT");
  });

  it("sandbox rail is a frame that refuses until wired", async () => {
    const rail = new SandboxPayPalRail({ clientId: "x", clientSecret: "y" });
    expect(await code(rail.get("ORDER-1"))).toBe("NOT_IMPLEMENTED");
  });
});

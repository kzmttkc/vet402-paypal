import { afterEach, describe, expect, it, vi } from "vitest";
import { PaypalSession } from "../src/mcp/session.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import { railFromEnv } from "../src/rail/select.js";
import { T0 } from "./helpers.js";

const RAIL_OPS = ["createOrder", "authorize", "capture", "void", "refund", "get"] as const;

describe("mcp rail selection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names the sandbox rail from PAYPAL_ENV and the mock otherwise", () => {
    expect(railFromEnv({}).name).toBe("mock");
    expect(railFromEnv({ PAYPAL_ENV: "mock" }).name).toBe("mock");
    expect(
      railFromEnv({ PAYPAL_ENV: "sandbox", PAYPAL_CLIENT_ID: "client-id", PAYPAL_CLIENT_SECRET: "client-secret" }).name,
    ).toBe("paypal-sandbox");

    expect(new PaypalSession(() => T0, {}).railName).toBe("mock");
    expect(new PaypalSession(() => T0, { PAYPAL_ENV: "mock" }).railName).toBe("mock");
    expect(new PaypalSession(() => T0, { PAYPAL_ENV: "live" }).railName).toBe("mock");
    expect(
      new PaypalSession(() => T0, {
        PAYPAL_ENV: "sandbox",
        PAYPAL_CLIENT_ID: "client-id",
        PAYPAL_CLIENT_SECRET: "client-secret",
      }).railName,
    ).toBe("paypal-sandbox");
  });

  it("does not call the rail when confirm is omitted", async () => {
    const spies = RAIL_OPS.map((op) => vi.spyOn(MockPayPalRail.prototype, op));
    const session = new PaypalSession(() => T0, {});
    const planned = await session.plan("collect 2 company records", 4_000);
    const jobId = String(planned.jobId);
    const held = await session.placeHold(jobId, undefined);
    const settled = await session.settle(jobId, false, { httpStatus: 200, body: "", latencyMs: 400 });
    expect(held).toMatchObject({ executed: false, needsConfirm: true });
    expect(settled).toMatchObject({ executed: false, needsConfirm: true });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("voids an open hold on the session rail when stopped", async () => {
    const voidSpy = vi.spyOn(MockPayPalRail.prototype, "void");
    const session = new PaypalSession(() => T0, {});
    const planned = await session.plan("collect 1 record", 2_000);
    const jobId = String(planned.jobId);
    const held = await session.placeHold(jobId, true);
    expect(held).toMatchObject({ executed: true, status: "authorized" });
    const stopped = await session.stop("owner pressed stop");
    expect(stopped.stopped).toBe(true);
    expect(voidSpy).toHaveBeenCalled();
  });
});

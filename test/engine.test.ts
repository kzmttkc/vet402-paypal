import { describe, expect, it } from "vitest";
import { Ledger, LedgerTamperedError } from "../src/ledger/index.js";
import { PolicyChangeRejected } from "../src/policy/mandate.js";
import { DAY, good, item, setup, T0 } from "./helpers.js";

const job = (conditionId: string, jobId = "job-1", sellerId = "seller.good", items = [item("a", 3_000)]) => ({ jobId, sellerId, conditionId, items });
const lastTypes = (s: ReturnType<typeof setup>, jobId: string) => s.engine.ledger.ofJob(jobId).map((e) => e.type);

describe("idempotency", () => {
  it("settling the same job twice captures once", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId));
    const r1 = await s.engine.settle("job-1", { a: good() });
    const r2 = await s.engine.settle("job-1", { a: good() });
    expect(r1.status).toBe("captured");
    expect(r2).toEqual(r1);
    expect(s.rail.callCount("capture")).toBe(1);
    expect(s.engine.ledger.ofJob("job-1").filter((e) => e.type === "capture")).toHaveLength(1);
  });

  it("requesting the same job twice authorizes once", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId));
    await s.engine.requestJob(job(s.conditionId));
    expect(s.rail.effectiveCalls("authorize")).toBe(1);
  });
});

describe("capture refusals are recorded", () => {
  it("capture after void (emergency stop voided it) is refused and recorded", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId));
    expect(await s.engine.emergencyStop("owner pressed stop")).toEqual(["job-1"]);
    const r = await s.engine.settle("job-1", { a: good() });
    expect(r.status).toBe("voided");
    expect(r.reasons).toContain("authorization_voided");
    expect(s.rail.callCount("capture")).toBe(0);
    const deny = s.engine.ledger.ofJob("job-1").at(-1)!;
    expect(deny.type).toBe("deny");
    expect(deny.data).toMatchObject({ op: "capture", reasons: ["authorization_voided"] });
  });

  it("capture after the authorization expired is refused and recorded", async () => {
    const s = setup({ mandate: { expiresAt: T0 + 60 * DAY } });
    await s.engine.requestJob(job(s.conditionId));
    s.c.advance(29 * DAY + 1);
    const r = await s.engine.settle("job-1", { a: good() });
    expect(r.reasons).toContain("authorization_expired");
    expect(s.rail.callCount("capture")).toBe(0);
    expect(lastTypes(s, "job-1").at(-1)).toBe("deny");
  });

  it("if the rail says expired (clocks differ), the refusal is recorded too", async () => {
    let railT = T0;
    const s = setup({ railNow: () => railT, mandate: { expiresAt: T0 + 60 * DAY } });
    await s.engine.requestJob(job(s.conditionId));
    railT += 30 * DAY;
    const r = await s.engine.settle("job-1", { a: good() });
    expect(r.reasons).toEqual(["AUTHORIZATION_EXPIRED"]);
    expect(r.status).toBe("expired");
    expect(s.engine.ledger.ofJob("job-1").at(-1)!.data).toMatchObject({ op: "capture", reasons: ["AUTHORIZATION_EXPIRED"] });
  });

  it("capture while stopped is refused and recorded (stop engaged before settle)", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId));
    s.engine.killSwitch.engage("manual");
    const r = await s.engine.settle("job-1", { a: good() });
    expect(r.reasons).toEqual(["emergency_stop"]);
    expect(s.rail.callCount("capture")).toBe(0);
    expect(s.engine.ledger.ofJob("job-1").at(-1)!.data).toMatchObject({ op: "capture", reasons: ["emergency_stop"] });
  });

  it("mandate expiry is checked again at capture time (second look)", async () => {
    const s = setup({ mandate: { expiresAt: T0 + DAY } });
    await s.engine.requestJob(job(s.conditionId));
    s.c.advance(DAY);
    const r = await s.engine.settle("job-1", { a: good() });
    expect(r.reasons).toContain("mandate_expired");
    expect(s.rail.callCount("capture")).toBe(0);
    expect(s.rail.effectiveCalls("void")).toBe(1);
  });

  it("revocation after authorization stops the capture", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId));
    s.policy.revoke();
    const r = await s.engine.settle("job-1", { a: good() });
    expect(r.reasons).toContain("mandate_revoked");
    expect(s.rail.callCount("capture")).toBe(0);
  });
});

describe("refused before the rail is called (rail calls = 0)", () => {
  it.each([
    ["over remaining budget", { mandate: { budgetCents: 2_000 } }, "over_remaining"],
    ["over daily cap", { mandate: { dailyCapCents: 2_000 } }, "over_daily_cap"],
    ["over monthly cap", { mandate: { monthlyCapCents: 2_000 } }, "over_monthly_cap"],
    ["revoked", { mandate: { revoked: true } }, "mandate_revoked"],
    ["expired", { mandate: { expiresAt: T0 } }, "mandate_expired"],
  ] as const)("%s", async (_n, opts, reason) => {
    const s = setup(opts);
    const r = await s.engine.requestJob(job(s.conditionId));
    expect(r.status).toBe("denied");
    expect(r.reasons).toContain(reason);
    expect(s.rail.callCount()).toBe(0);
    expect(lastTypes(s, "job-1")).toEqual(["deny"]);
  });

  it("seller not on the allow list", async () => {
    const s = setup();
    const r = await s.engine.requestJob(job(s.conditionId, "job-x", "seller.unknown"));
    expect(r.reasons).toEqual(["seller_not_allowed"]);
    expect(s.rail.callCount()).toBe(0);
  });

  it("remaining counts open authorizations", async () => {
    const s = setup({ mandate: { budgetCents: 5_000 } });
    await s.engine.requestJob(job(s.conditionId, "j1"));
    const r = await s.engine.requestJob(job(s.conditionId, "j2"));
    expect(r.reasons).toContain("over_remaining");
    expect(s.rail.effectiveCalls("createOrder")).toBe(1);
  });

  it("stopped engine authorizes nothing", async () => {
    const s = setup();
    await s.engine.emergencyStop("stop");
    const r = await s.engine.requestJob(job(s.conditionId));
    expect(r.reasons).toEqual(["emergency_stop"]);
    expect(s.rail.callCount()).toBe(0);
  });

  it("stop engaged during createOrder: authorize is never called", async () => {
    const s = setup();
    const orig = s.rail.createOrder.bind(s.rail);
    s.rail.createOrder = async (...a) => {
      const o = await orig(...a);
      s.engine.killSwitch.engage("race");
      return o;
    };
    const r = await s.engine.requestJob(job(s.conditionId));
    expect(r.reasons).toEqual(["emergency_stop"]);
    expect(s.rail.callCount("authorize")).toBe(0);
  });

  it("a condition must be fixed before authorization", async () => {
    const s = setup();
    await expect(s.engine.requestJob(job("cond_unknown"))).rejects.toThrow(/fixed before authorization/);
    expect(s.rail.callCount()).toBe(0);
  });
});

describe("ledger tampering stops capture", () => {
  it("rewriting one ledger line breaks verifyChain and capture is not called", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId));
    const lines = s.engine.ledger.toJsonl().split("\n");
    lines[0] = lines[0]!.replace('"amountCents":3000', '"amountCents":1');
    const tampered = Ledger.fromJsonl(lines.join("\n"), s.c.now);
    expect(tampered.verifyChain().ok).toBe(false);

    // Same engine state, but its ledger now carries the rewritten line.
    (s.engine as unknown as { ledger: Ledger }).ledger = tampered;
    await expect(s.engine.settle("job-1", { a: good() })).rejects.toBeInstanceOf(LedgerTamperedError);
    expect(s.rail.callCount("capture")).toBe(0);
    expect(s.engine.killSwitch.engaged).toBe(true);
  });
});

describe("three outcomes and partial capture", () => {
  it("captures only the passed items and releases the rest", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId, "job-1", "seller.good", [item("a", 3_000), item("b", 2_000)]));
    const r = await s.engine.settle("job-1", { a: good(), b: good({ httpStatus: 500 }) });
    expect(r.status).toBe("captured");
    expect(r.capturedCents).toBe(3_000);
    expect(s.engine.ledger.ofJob("job-1").at(-1)!.data).toMatchObject({ amountCents: 3_000, releasedCents: 2_000 });
  });

  it("nothing passed → void", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId));
    const r = await s.engine.settle("job-1", { a: good({ body: "" }) });
    expect(r.status).toBe("voided");
    expect(s.rail.callCount("capture")).toBe(0);
  });

  it("unsure → a person decides, then capture", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId));
    const r1 = await s.engine.settle("job-1", { a: good({ latencyMs: 60_000 }) });
    expect(r1.status).toBe("needs_human");
    expect(s.rail.callCount("capture")).toBe(0);
    const r2 = await s.engine.resolveHuman("job-1", "a", "capture", "takeshi");
    expect(r2.status).toBe("captured");
  });

  it("refund after capture is recorded", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId));
    await s.engine.settle("job-1", { a: good() });
    await s.engine.refund("job-1", 1_000, "defect found later");
    expect(lastTypes(s, "job-1").at(-1)).toBe("refund");
    expect(s.engine.ledger.verifyChain().ok).toBe(true);
  });
});

describe("autonomy and tighten-only policy", () => {
  it("careful: every job waits for a person before the rail", async () => {
    const s = setup({ mandate: { autonomy: "careful" } });
    const r = await s.engine.requestJob(job(s.conditionId));
    expect(r.status).toBe("pending_human");
    expect(s.rail.callCount()).toBe(0);
    const r2 = await s.engine.approveJob("job-1", "takeshi");
    expect(r2.status).toBe("authorized");
  });

  it("balanced: automatic at or below the threshold only", async () => {
    const s = setup({ mandate: { autonomy: "balanced", autoApproveMaxCents: 3_000 } });
    expect((await s.engine.requestJob(job(s.conditionId, "j1"))).status).toBe("authorized");
    expect((await s.engine.requestJob(job(s.conditionId, "j2", "seller.good", [item("a", 3_001)]))).status).toBe("pending_human");
  });

  it("the approval threshold and autonomy can only be tightened", () => {
    const s = setup({ mandate: { autonomy: "balanced", autoApproveMaxCents: 3_000 } });
    s.policy.setAutoApproveMax(1_000);
    expect(() => s.policy.setAutoApproveMax(1_001)).toThrow(PolicyChangeRejected);
    s.policy.setAutonomy("careful");
    expect(() => s.policy.setAutonomy("autopilot")).toThrow(PolicyChangeRejected);
    expect(() => s.policy.setCaps({ dailyCapCents: 999_999 })).toThrow(PolicyChangeRejected);
    expect(() => s.policy.shortenExpiry(T0 + 365 * DAY)).toThrow(PolicyChangeRejected);
  });

  it("emergency stop voids every open authorization", async () => {
    const s = setup();
    await s.engine.requestJob(job(s.conditionId, "j1"));
    await s.engine.requestJob(job(s.conditionId, "j2"));
    expect(await s.engine.emergencyStop("stop")).toEqual(["j1", "j2"]);
    expect(s.rail.effectiveCalls("void")).toBe(2);
  });
});

describe("amounts come from code", () => {
  it("a scorer cannot change the captured amount", async () => {
    const s = setup({ scorer: () => ({ outcome: "capture", amountCents: 999_999 }) as unknown as number });
    await s.engine.requestJob(job(s.conditionId));
    const r = await s.engine.settle("job-1", { a: good() });
    expect(r.status).toBe("needs_human");
    expect(s.rail.callCount("capture")).toBe(0);
  });

  it("prices must be integer cents", async () => {
    const s = setup();
    await expect(s.engine.requestJob(job(s.conditionId, "j", "seller.good", [item("a", 19.99)]))).rejects.toThrow(/integer of cents/);
  });
});

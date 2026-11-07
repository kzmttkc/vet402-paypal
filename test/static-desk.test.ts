import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { copyFor } from "../src/i18n/copy.js";
import { sha256Hex } from "../src/hash/sha256.js";
import { createDemoDesk, DEMO_SELLER } from "../src/demo/browser-desk.js";
import { aggregateSellers, approvalSentence, loadFrozenExport, pickSellerFor } from "../src/sellers/index.js";
import { createHash as shimHash } from "../web/shims/crypto.js";
import { createBrowserTransport } from "../web/src/browser-api.js";
import { scoreWhenModelMissing } from "../web/src/local-score.js";
import { judge } from "../src/verify/judge.js";
import { fixCondition } from "../src/verify/condition.js";
import { COMPANY_RECORDS } from "../eval/condition.js";
import { good } from "./helpers.js";

describe("static demo", () => {
  it("hashes the same bytes as node", () => {
    const samples = ["", "abc", "PayPal-Request-Id", "模擬・お金は動かない", "a".repeat(1000)];
    for (const sample of samples) {
      expect(sha256Hex(sample)).toBe(createHash("sha256").update(sample).digest("hex"));
      expect(shimHash("sha256").update(sample).digest("hex")).toBe(createHash("sha256").update(sample).digest("hex"));
    }
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("uses the seller the frozen export would pick", () => {
    const live = pickSellerFor(aggregateSellers(loadFrozenExport().rows), "company");
    expect(live.sample).toBe(false);
    expect(approvalSentence(DEMO_SELLER)).toBe(approvalSentence(live.seller));
    expect(DEMO_SELLER.resourceKey).toBe(live.seller.resourceKey);
    expect(live.seller.resourceKey).not.toMatch(/header/i);
  });

  it("captures the left delivery and voids the right one with no server", async () => {
    const desk = createDemoDesk();
    const played = await desk.playBoth(5_000);
    expect(played.left.status).toBe("captured");
    expect(played.right.status).toBe("voided");
    expect(played.right.summary).toBe("$0. Your agent didn't lose a cent.");
    expect(played.left.orderId).toMatch(/^ORDER-MOCK-/);
    expect(played.right.captureId).toBeNull();
    expect(desk.activity().chains.every((chain) => chain.ok)).toBe(true);
    expect(copyFor("en").simulatedBanner).toBe(
      "Simulated. No money moves. Capture needs a recorded yes and a company-exemplar match.",
    );
    expect(copyFor("ja").simulatedBanner).toBe("模擬です。お金は動きません。確定には、記録された yes と会社の見本との一致が要ります。");
  });

  it("does not capture when the page model never loaded", async () => {
    expect(scoreWhenModelMissing()).toBe(0);
    const verdict = await judge(fixCondition(COMPANY_RECORDS), good(), async () => scoreWhenModelMissing());
    expect(verdict.outcome).not.toBe("capture");
    expect(verdict.outcome).toBe("void");
  });

  it("voids an open hold from the stop switch", async () => {
    const desk = createDemoDesk();
    const planned = desk.plan({ brief: "Collect company records", budgetCents: 5_000, autonomy: "careful" });
    expect((await desk.approve(planned.jobId)).status).toBe("authorized");
    await desk.emergencyStop("owner pressed stop");
    expect(desk.isStopped).toBe(true);
    expect(desk.job(planned.jobId).status).toBe("voided");
  });

  it("answers the page routes from the browser transport", async () => {
    const api = createBrowserTransport();
    const health = await api<{ rail: string; stopped: boolean }>("/api/health");
    expect(health).toEqual({ ok: true, rail: "mock", stopped: false });
    const sdk = await api<{ sdk: string; clientId: null; mode: string }>("/api/paypal-sdk");
    expect(sdk).toEqual({ sdk: "v6", script: null, clientId: null, mode: "mock" });
    const played = await api<{ left: { status: string }; right: { status: string } }>("/api/demo", { budgetCents: 5_000 });
    expect(played.left.status).toBe("captured");
    expect(played.right.status).toBe("voided");
    const card = await api<{ status: string; holdCents: number }>("/api/jobs", {
      brief: "Collect company records",
      budgetCents: 5_000,
      autonomy: "careful",
    });
    expect(card.status).toBe("planned");
    expect(card.holdCents).toBe(5_000);
    const stopped = await api<{ stopped: boolean }>("/api/stop", { reason: "owner pressed stop" });
    expect(stopped.stopped).toBe(true);
  });
});

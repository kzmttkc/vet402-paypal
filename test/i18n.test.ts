import { describe, expect, it } from "vitest";
import { formatUsd } from "../src/policy/money.js";
import {
  copyFor,
  langFromSearch,
  presentHoldQuestion,
  presentSellerLine,
  presentSummary,
  modelLoadingLine,
  scoreLine,
  scoreModelLine,
  screenJob,
} from "../src/i18n/copy.js";

const seller = "4 paid purchases, 50.0% matched the promised shape, 50.0% errors after payment";

describe("screen language", () => {
  it("defaults to English and uses Japanese screen copy when lang=ja", () => {
    expect(langFromSearch("")).toBe("en");
    expect(langFromSearch("?lang=en")).toBe("en");
    expect(langFromSearch("?lang=jp")).toBe("en");
    expect(langFromSearch("?lang=ja")).toBe("ja");
    expect(langFromSearch("?x=1&lang=ja")).toBe("ja");
    expect(copyFor("en").title).toBe("Place a hold. Pay only for what arrived.");
    expect(copyFor("ja").title).toBe("与信する。届いた分だけ支払う。");
    expect(copyFor("ja").play).not.toBe(copyFor("en").play);
    expect(copyFor("en").balanced).toContain("$50.00");
    expect(copyFor("ja").balanced).toContain("$50.00");
    expect(scoreModelLine("en", { phase: "ready" })).toContain("embedding");
    expect(scoreModelLine("ja", { phase: "ready" })).toContain("埋め込み");
    expect(scoreModelLine("ja", { phase: "download", ratio: 0.4 })).toContain("40%");
    expect(scoreModelLine("en", { phase: "failed" })).toContain("did not load");
    expect(modelLoadingLine("en", 0.42)).toBe("AI model loading: 42%");
    expect(modelLoadingLine("ja", 0.42)).toBe("AIモデルを読み込んでいます: 42%");
    expect(modelLoadingLine("en", 0)).toBe("AI model loading: 0%");
  });

  it("keeps the same amount and id text in English and Japanese", () => {
    const job = {
      status: "captured",
      holdCents: 5000,
      capturedCents: 2500,
      summary: "Captured $25.00 of $50.00 hold. $25.00 released.",
      sellerLine: seller,
      holdQuestion: "May I place a hold of $50.00 until each delivery checks out?",
      conditionId: "cond_abc",
      orderId: "ORDER-MOCK-000001",
      sellerId: "seller_key",
      condition: { description: "A list of companies with name, ISO country code, employee count, founding year and a source URL." },
      items: [{ label: "First half of the delivery", progress: "PASS → captured", price: "$25.00" }],
    };
    const en = screenJob(job, "en");
    const ja = screenJob(job, "ja");
    expect(en).toBe(job);
    expect(en.summary).toBe(job.summary);
    expect(ja.summary).toContain("$50.00");
    expect(ja.summary).toContain("$25.00");
    expect(ja.summary).toContain(formatUsd(2500));
    expect(ja.holdQuestion).toContain(formatUsd(5000));
    expect(presentHoldQuestion("en", 5000, job.holdQuestion)).toBe(job.holdQuestion);
    expect(presentSellerLine("ja", seller)).toBe("4 件の支払い済み、形の一致 50.0%、支払い後のエラー 50.0%");
    expect(presentSellerLine("en", seller)).toBe(seller);
    expect(ja.conditionId).toBe("cond_abc");
    expect(ja.orderId).toBe("ORDER-MOCK-000001");
    expect(ja.sellerId).toBe("seller_key");
    expect(ja.items[0]?.price).toBe("$25.00");
    expect(presentSummary("ja", { ...job, status: "voided", capturedCents: 0, summary: "$0. Your agent didn't lose a cent." })).toBe(
      "$0。失ったお金はありません。",
    );
    expect(scoreLine("en", 0.9, 0.6)).toBe("Pass at 0.90 or above. Void below 0.60. Between those, a person decides.");
    expect(scoreLine("ja", 0.9, 0.6)).toContain("0.90");
    expect(scoreLine("ja", 0.9, 0.6)).toContain("0.60");
  });
});

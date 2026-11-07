import { afterEach, describe, expect, it } from "vitest";
import { COMPANY_RECORDS } from "../eval/condition.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import type { SellerStats } from "../src/sellers/aggregate.js";
import { createApp } from "../src/server/app.js";
import { Desk } from "../src/server/desk.js";
import { HONEST_BODY } from "../src/server/deliveries.js";
import { fixCondition } from "../src/verify/condition.js";
import { judge } from "../src/verify/judge.js";
import { useLanguageAsk, type LanguageAsk } from "../src/verify/language.js";
import { beginModelLoad, bootLanguageModel, modelPhase, resetModelLoadForTests, useEmbeddingOnly, warmingScorer } from "../src/verify/warmup.js";

const cond = fixCondition(COMPANY_RECORDS);
const honest = { httpStatus: 200, body: HONEST_BODY, latencyMs: 100 };
const empty = { httpStatus: 200, body: "", latencyMs: 100 };
const wrong = {
  httpStatus: 200,
  body: JSON.stringify({
    records: [{ name: "Clear Skies", country: "US", employees: 12, founded: 1990, source_url: "https://example.com/w" }],
  }),
  latencyMs: 100,
};

const seller: SellerStats = {
  resourceKey: "example.test/company",
  attempts: 10,
  settled: 10,
  paid2xx: 10,
  paid4xx: 0,
  paid5xx: 0,
  shapeMatch: 10,
  shapeMismatch: 0,
  shapeMatchRate: 1,
  postPayErrorRate: 0,
};

afterEach(() => {
  resetModelLoadForTests();
  useLanguageAsk(async () => "Yes.");
});

describe("model warmup", () => {
  it("captures the honest delivery and voids the empty one before Qwen3, then voids a different subject after", async () => {
    useLanguageAsk(null);
    let release: (ask: LanguageAsk) => void = () => {};
    const pending = beginModelLoad((onProgress) => {
      onProgress(0.4);
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    expect(modelPhase()).toEqual({ phase: "download", ratio: 0.4 });

    const app = createApp({ rail: new MockPayPalRail() });
    const health = (await (await app.request("/api/health")).json()) as { model: { phase: string; ratio: number } };
    expect(health.model).toEqual({ phase: "download", ratio: 0.4 });

    const scorer = warmingScorer(cond);
    expect((await judge(cond, honest, scorer)).outcome).toBe("capture");
    expect((await judge(cond, empty, scorer)).outcome).toBe("void");
    expect((await judge(cond, wrong, scorer)).outcome).toBe("capture");

    const desk = new Desk({ rail: new MockPayPalRail(), sellers: new Map([[seller.resourceKey, seller]]) });
    const played = await desk.playBoth(5_000);
    expect(played.left.status).toBe("captured");
    expect(played.right.status).toBe("voided");

    release(async (prompt) => (prompt.includes("Clear Skies") ? "No." : "Yes."));
    await pending;
    expect(modelPhase()).toEqual({ phase: "ready", ratio: 1 });
    expect((await judge(cond, honest, scorer)).outcome).toBe("capture");
    const voided = await judge(cond, wrong, scorer);
    expect(voided.outcome).toBe("void");
    expect(voided.reason).toBe("score_low");

    const again = await desk.playBoth(5_000);
    expect(again.left.status).toBe("captured");
    expect(again.right.status).toBe("voided");
  });

  it("does not load Qwen3 when SCORER=embedding", async () => {
    useLanguageAsk(async () => "No.");
    bootLanguageModel({ SCORER: "embedding" });
    expect(modelPhase()).toEqual({ phase: "embedding", ratio: 1 });
    const scorer = warmingScorer(cond);
    const verdict = await judge(cond, wrong, scorer);
    expect(verdict.outcome).toBe("capture");
    useEmbeddingOnly();
    expect((await judge(cond, honest, warmingScorer(cond))).outcome).toBe("capture");
  });

  it("forgets a failed load and still captures with the embedding floor", async () => {
    useLanguageAsk(null);
    await expect(beginModelLoad(async () => {
      throw new Error("offline");
    })).rejects.toThrow("offline");
    expect(modelPhase().phase).toBe("failed");
    const scorer = warmingScorer(cond);
    const before = await judge(cond, honest, scorer);
    expect(before.outcome).toBe("capture");
    expect(before.reason).not.toBe("scorer_invalid");

    await beginModelLoad(async () => async () => "No.");
    expect(modelPhase().phase).toBe("ready");
    expect((await judge(cond, wrong, scorer)).outcome).toBe("void");
  });
});

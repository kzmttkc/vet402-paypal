import { describe, expect, it, vi } from "vitest";
import { COMPANY_RECORDS } from "../eval/condition.js";
import { fixCondition } from "../src/verify/condition.js";
import { judge } from "../src/verify/judge.js";
import { isLanguageScore, useLanguageAsk } from "../src/verify/language.js";
import { embeddingDetail, scorerFromEnv, useEmbedder, type Embedder } from "../src/verify/score.js";
import { good, goodRecords } from "./helpers.js";

const cond = fixCondition(COMPANY_RECORDS);
const sameVector: Embedder = async () => Float32Array.of(1, 0, 0);

describe("embedding scorer", () => {
  it("scores a matching delivery in [0,1] with a short reason", async () => {
    const detail = await embeddingDetail(cond, sameVector)({
      conditionDescription: cond.spec.description,
      data: { records: goodRecords },
    });
    expect(detail.score).toBeGreaterThanOrEqual(cond.spec.ai.passAt);
    expect(detail.score).toBeLessThanOrEqual(1);
    expect(detail.reason.length).toBeGreaterThan(0);
    expect(detail.reason.length).toBeLessThanOrEqual(160);
    expect(detail.reason).toMatch(/similarity/i);
  });

  it("scores a delivery that breaks the shape rules below the void line", async () => {
    const detail = await embeddingDetail(cond, sameVector)({
      conditionDescription: cond.spec.description,
      data: { records: [] },
    });
    expect(detail.score).toBeLessThan(cond.spec.ai.voidBelow);
    expect(detail.reason).toMatch(/records/i);
  });

  it("embeds field values only as quoted data", async () => {
    const seen: string[] = [];
    const embed: Embedder = async (text) => {
      seen.push(text);
      return Float32Array.of(1, 0, 0);
    };
    await embeddingDetail(cond, embed)({
      conditionDescription: cond.spec.description,
      data: { records: goodRecords },
    });
    const fields = seen.filter((t) => t.includes("records[]"));
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((t) => t.includes(JSON.stringify("Kizuna Logistics")))).toBe(true);
    expect(fields.every((t) => t.includes(": "))).toBe(true);
  });
});

describe("scorer selection", () => {
  it("uses the local language model when ANTHROPIC_API_KEY is absent", async () => {
    const fetchImpl = vi.fn();
    const scorer = scorerFromEnv(cond, {}, fetchImpl as unknown as typeof fetch);
    const score = await scorer({ conditionDescription: cond.spec.description, data: { records: goodRecords } });
    expect(isLanguageScore(score)).toBe(true);
    if (!isLanguageScore(score)) return;
    expect(score.score).toBeGreaterThanOrEqual(cond.spec.ai.passAt);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses the embedding floor when SCORER=embedding and does not ask Qwen3", async () => {
    const seen: string[] = [];
    useLanguageAsk(async (prompt) => {
      seen.push(prompt);
      return "No.";
    });
    useEmbedder(sameVector);
    const fetchImpl = vi.fn();
    const scorer = scorerFromEnv(cond, { SCORER: "embedding" }, fetchImpl as unknown as typeof fetch);
    const score = await scorer({ conditionDescription: cond.spec.description, data: { records: goodRecords } });
    expect(score).toBeGreaterThanOrEqual(cond.spec.ai.passAt);
    expect(seen).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
    useLanguageAsk(async () => "Yes.");
  });

  it("calls Claude only when a key is set and returns that score", async () => {
    const key = "sk-ant-test-secret-value";
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        model: string;
        tools: { input_schema: { required: string[]; additionalProperties: boolean; properties: Record<string, unknown> } }[];
      };
      expect(body.model).toBe("claude-sonnet-5-5");
      expect(body.tools[0]!.input_schema.additionalProperties).toBe(false);
      expect([...body.tools[0]!.input_schema.required].sort()).toEqual(["reason", "score"]);
      expect(Object.keys(body.tools[0]!.input_schema.properties).sort()).toEqual(["reason", "score"]);
      return new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "report_score", input: { score: 0.91, reason: "matches the description" } }],
        }),
        { status: 200 },
      );
    });
    const scorer = scorerFromEnv(cond, { ANTHROPIC_API_KEY: key }, fetchImpl as unknown as typeof fetch);
    const score = await scorer({ conditionDescription: cond.spec.description, data: { records: goodRecords } });
    expect(score).toBeCloseTo(0.91);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a Claude answer that is not exactly score and reason", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "report_score", input: { score: 1, reason: "ok", amount: 500 } }],
        }),
        { status: 200 },
      ),
    );
    const scorer = scorerFromEnv(cond, { ANTHROPIC_API_KEY: "sk-ant-test-secret-value" }, fetchImpl as unknown as typeof fetch);
    await expect(scorer({ conditionDescription: "companies", data: { records: goodRecords } })).rejects.toThrow(/unusable/);
  });

  it("does not include the API key in errors", async () => {
    const key = "sk-ant-test-secret-value";
    const fetchImpl = vi.fn(async () => new Response(`denied ${key}`, { status: 401 }));
    const scorer = scorerFromEnv(cond, { ANTHROPIC_API_KEY: key }, fetchImpl as unknown as typeof fetch);
    const error = await scorer({ conditionDescription: "x", data: { records: goodRecords } }).then(
      () => "",
      (e: unknown) => (e instanceof Error ? `${e.name} ${e.message}` : String(e)),
    );
    expect(error).not.toContain(key);
    expect(error.length).toBeGreaterThan(0);
  });

  it("sends tool_choice auto and thinking between_tools, and does not send temperature", async () => {
    let body: {
      tool_choice?: { type: string; name?: string };
      thinking?: { type: string };
      temperature?: number;
      system?: string;
    } = {};
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as typeof body;
      return new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "report_score", input: { score: 0.91, reason: "matches the description" } }],
        }),
        { status: 200 },
      );
    });
    const scorer = scorerFromEnv(cond, { ANTHROPIC_API_KEY: "sk-ant-test-secret-value" }, fetchImpl as unknown as typeof fetch);
    await scorer({ conditionDescription: cond.spec.description, data: { records: goodRecords } });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body.thinking).toEqual({ type: "between_tools" });
    expect(body.temperature).toBeUndefined();
    expect(body.system).toContain("Call report_score exactly once.");
  });

  it("reads report_score when a text block comes before tool_use", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "The delivery matches." },
            { type: "tool_use", name: "report_score", input: { score: 0.91, reason: "matches the description" } },
          ],
        }),
        { status: 200 },
      ),
    );
    const scorer = scorerFromEnv(cond, { ANTHROPIC_API_KEY: "sk-ant-test-secret-value" }, fetchImpl as unknown as typeof fetch);
    const score = await scorer({ conditionDescription: cond.spec.description, data: { records: goodRecords } });
    expect(score).toBeCloseTo(0.91);
  });
});

describe("judge default scorer", () => {
  it("still captures a good delivery", async () => {
    useEmbedder(sameVector);
    const v = await judge(cond, good());
    expect(v.outcome).toBe("capture");
    expect(v.score).toBeGreaterThanOrEqual(cond.spec.ai.passAt);
  });
});

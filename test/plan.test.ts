import { describe, expect, it, vi } from "vitest";
import { planJob } from "../src/plan/job.js";

describe("job plan", () => {
  it("drafts the count from the brief and prices it in code when no key is set", async () => {
    const fetchImpl = vi.fn();
    const plan = await planJob("collect 10 company records", 5_000, { env: {}, fetch: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ count: 10, priceCents: 5_000 });
    expect(plan.totalCents).toBe(5_000);
    expect(plan.passAt).toBe(0.9);
    expect(plan.voidBelow).toBe(0.6);
    expect(plan.description.length).toBeGreaterThan(0);
  });

  it("plan prices are recomputed by code and the model's amounts are ignored", async () => {
    let itemProperties: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        model: string;
        tools: { input_schema: { properties: { items: { items: { properties: Record<string, unknown> } } } } }[];
      };
      expect(body.model).toBe("claude-sonnet-5-5");
      itemProperties = body.tools[0]!.input_schema.properties.items.items.properties;
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "report_plan",
              input: {
                description: "Two batches of company records",
                passAt: 0,
                items: [
                  { label: "batch a", count: 25, priceCents: 999_999 },
                  { label: "batch b", count: 25, priceCents: 1 },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const plan = await planJob("collect 50 companies", 5_000, {
      env: { ANTHROPIC_API_KEY: "sk-ant-test-secret-value" },
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(plan.items.map((i) => i.label)).toEqual(["batch a", "batch b"]);
    expect(plan.items.map((i) => i.count)).toEqual([25, 25]);
    expect(plan.items.map((i) => i.priceCents)).toEqual([2_500, 2_500]);
    expect(plan.totalCents).toBe(5_000);
    expect(plan.passAt).toBe(0.9);
    expect(plan.voidBelow).toBe(0.6);
    expect(itemProperties?.priceCents).toBeUndefined();
  });

  it("does not include the API key when the model call fails", async () => {
    const key = "sk-ant-test-secret-value";
    const fetchImpl = vi.fn(async () => new Response(`no ${key}`, { status: 500 }));
    const plan = await planJob("collect 4 records", 4_000, {
      env: { ANTHROPIC_API_KEY: key },
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(JSON.stringify(plan)).not.toContain(key);
    expect(plan.totalCents).toBe(4_000);
    expect(plan.items[0]?.priceCents).toBe(4_000);
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
          content: [
            {
              type: "tool_use",
              name: "report_plan",
              input: { description: "Two records", items: [{ label: "companies", count: 2 }] },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const plan = await planJob("collect 2 company records", 2_000, {
      env: { ANTHROPIC_API_KEY: "sk-ant-test-secret-value" },
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body.thinking).toEqual({ type: "between_tools" });
    expect(body.temperature).toBeUndefined();
    expect(body.system).toContain("Always call report_plan.");
    expect(plan.description).toBe("Two records");
    expect(plan.items.map((item) => item.priceCents)).toEqual([2_000]);
    expect(plan.passAt).toBe(0.9);
    expect(plan.voidBelow).toBe(0.6);
  });

  it("reads report_plan when a text block comes before tool_use", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "Drafting the work." },
            {
              type: "tool_use",
              name: "report_plan",
              input: { description: "Two batches", items: [{ label: "batch a", count: 3 }] },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const plan = await planJob("collect 9 company records", 3_000, {
      env: { ANTHROPIC_API_KEY: "sk-ant-test-secret-value" },
      fetch: fetchImpl as unknown as typeof fetch,
    });
    expect(plan.description).toBe("Two batches");
    expect(plan.items.map((item) => item.count)).toEqual([3]);
    expect(plan.items.map((item) => item.priceCents)).toEqual([3_000]);
  });
});

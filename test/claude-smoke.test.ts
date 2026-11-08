import { describe, expect, it, vi } from "vitest";
import { runClaudeSmoke } from "../eval/claude-smoke.js";

const KEY = "sk-ant-test-secret-value";

describe("claude smoke", () => {
  it("exits 2 and does not call when the key is missing", async () => {
    const fetchImpl = vi.fn();
    const lines: string[] = [];
    for (const env of [{}, { ANTHROPIC_API_KEY: "   " }]) {
      const code = await runClaudeSmoke({
        env,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        log: (line) => lines.push(line),
      });
      expect(code).toBe(2);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lines).toEqual([]);
  });

  it("calls score and plan once, reads tool_use after a text block, and does not print the key", async () => {
    const bodies: { tool_choice?: { type: string }; thinking?: { type: string }; temperature?: number; tools?: { name: string }[] }[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as (typeof bodies)[number];
      bodies.push(body);
      const name = body.tools?.[0]?.name;
      if (name === "report_score") {
        return new Response(
          JSON.stringify({
            content: [
              { type: "text", text: "matches" },
              { type: "tool_use", name: "report_score", input: { score: 0.91, reason: "matches the description" } },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "draft" },
            { type: "tool_use", name: "report_plan", input: { description: "Two records", items: [{ label: "companies", count: 2 }] } },
          ],
        }),
        { status: 200 },
      );
    });
    const lines: string[] = [];
    const code = await runClaudeSmoke({
      env: { ANTHROPIC_API_KEY: KEY },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodies.map((body) => body.tools?.[0]?.name)).toEqual(["report_score", "report_plan"]);
    for (const body of bodies) {
      expect(body.tool_choice).toEqual({ type: "auto" });
      expect(body.thinking).toEqual({ type: "between_tools" });
      expect(body.temperature).toBeUndefined();
    }
    expect(lines).toEqual(["score: called, read tool_use", "plan: called, read tool_use"]);
    expect(lines.join("\n")).not.toContain(KEY);
  });
});

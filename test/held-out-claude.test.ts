import { describe, expect, it, vi } from "vitest";
import { HELD_OUT_NAMES } from "../eval/held-out-names.js";
import { runHeldOutClaude } from "../eval/held-out-claude.js";

const KEY = "sk-ant-test-secret-value";
const NOW = new Date("2026-11-08T03:04:05.000Z");

function claudeText(text: string, status = 200): Response {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status });
}

describe("held-out Claude", () => {
  it("stops before any request when the key is missing", async () => {
    const fetchImpl = vi.fn();
    const logs: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      for (const env of [{}, { ANTHROPIC_API_KEY: "   " }]) {
        await expect(
          runHeldOutClaude({
            env,
            fetchImpl: fetchImpl as unknown as typeof fetch,
            now: NOW,
          }),
        ).rejects.toMatchObject({ exitCode: 2 });
      }
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(logs.join("\n")).toBe("");
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("counts yes as capture, no as void, and an unreadable answer as human", async () => {
    const names = [HELD_OUT_NAMES[0]!, HELD_OUT_NAMES[30]!, HELD_OUT_NAMES[7]!] as const;
    const replies = ["yes", "No.", "perhaps"];
    let sent = 0;
    const fetchImpl = vi.fn(async (url: unknown, init: RequestInit) => {
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init.method).toBe("POST");
      const headers = new Headers(init.headers);
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("x-api-key")).toBe(KEY);
      const body = JSON.parse(String(init.body)) as {
        model: string;
        max_tokens: number;
        temperature?: number;
        thinking: { type: string };
        messages: { role: string; content: string }[];
      };
      expect(body.model).toBe("claude-sonnet-5-5");
      expect(body.max_tokens).toBe(16);
      expect(body.temperature).toBeUndefined();
      expect(body.thinking).toEqual({ type: "between_tools" });
      expect(body.messages).toEqual([
        { role: "user", content: `Is ${JSON.stringify(names[sent]!.text)} a company name? Answer yes or no.` },
      ]);
      return claudeText(replies[sent++]!);
    });

    const report = await runHeldOutClaude({
      env: { ANTHROPIC_API_KEY: KEY },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      names,
      now: NOW,
    });

    expect(sent).toBe(3);
    expect(report.rows.map((row) => [row.text, row.answer, row.payment, row.correct])).toEqual([
      ["Toyota Motor", "yes", "capture", true],
      ["Tuesday Sunrise", "no", "void", true],
      ["Honda Motor", null, "human", false],
    ]);
    expect(report.rows[2]?.raw).toBe("perhaps");
    expect(report.n).toBe(3);
    expect(report.correct).toBe(2);
    expect(report.accuracy).toBe(2 / 3);
    expect(report.capture).toBe(1);
    expect(report.void).toBe(1);
    expect(report.human).toBe(1);
    expect(report.wrong.map((row) => row.text)).toEqual(["Honda Motor"]);
    expect(report.model).toBe("claude-sonnet-5-5");
    expect(report.retrieved_at).toBe("2026-11-08T03:04:05.000Z");
    expect(JSON.stringify(report)).not.toContain(KEY);
  });

  it("sends ANTHROPIC_MODEL and still asks all 60 held-out names", async () => {
    let sent = 0;
    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { model: string; messages: { content: string }[] };
      expect(body.model).toBe("claude-test-model");
      expect(body.messages[0]?.content).toBe(
        `Is ${JSON.stringify(HELD_OUT_NAMES[sent]!.text)} a company name? Answer yes or no.`,
      );
      sent += 1;
      return claudeText("yes");
    });

    const report = await runHeldOutClaude({
      env: { ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: " claude-test-model " },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: NOW,
    });

    expect(sent).toBe(60);
    expect(report.n).toBe(60);
    expect(report.model).toBe("claude-test-model");
    expect(report.capture).toBe(60);
    expect(JSON.stringify(report)).not.toContain(KEY);
  });

  it("keeps the API key out of an HTTP error body", async () => {
    const logs: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const fetchImpl = vi.fn(async () => new Response(`denied ${KEY} in the body`, { status: 401 }));
    let caught = "";
    try {
      await runHeldOutClaude({
        env: { ANTHROPIC_API_KEY: KEY },
        fetchImpl: fetchImpl as unknown as typeof fetch,
        names: [HELD_OUT_NAMES[0]!],
        now: NOW,
      });
    } catch (err) {
      caught = err instanceof Error ? `${err.name}\n${err.message}\n${err.stack ?? ""}` : String(err);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
    expect(caught).not.toContain(KEY);
    expect(logs.join("\n")).not.toContain(KEY);
    expect(caught).toMatch(/claude request failed/);
  });

  it("skips a thinking block and reads the first text block", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: "thinking", thinking: "This might be yes." },
            { type: "text", text: "No." },
            { type: "text", text: "yes" },
          ],
        }),
        { status: 200 },
      ),
    );
    const report = await runHeldOutClaude({
      env: { ANTHROPIC_API_KEY: KEY },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      names: [HELD_OUT_NAMES[30]!],
      now: NOW,
    });
    expect(report.rows[0]?.raw).toBe("No.");
    expect(report.rows[0]?.answer).toBe("no");
    expect(report.rows[0]?.payment).toBe("void");
  });
});

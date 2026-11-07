import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--no-deprecation", "--import", "tsx", "src/mcp/main.ts"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const client = new Client({ name: "vet402-test", version: "0.0.1" });

function textOf(result: unknown): string {
  if (result === null || typeof result !== "object" || !("content" in result) || !Array.isArray(result.content)) {
    throw new Error("tool returned no text");
  }
  for (const block of result.content) {
    if (block !== null && typeof block === "object" && "type" in block && block.type === "text" && "text" in block && typeof block.text === "string") {
      return block.text;
    }
  }
  throw new Error("tool returned no text");
}

describe("mcp", () => {
  beforeAll(async () => {
    await client.connect(transport);
  }, 20_000);

  afterAll(async () => {
    await client.close();
  });

  it("mcp initialize and tools/list return the six tools", async () => {
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name).sort()).toEqual([
      "check_delivery",
      "emergency_stop",
      "get_activity",
      "place_hold",
      "plan_job",
      "settle_job",
    ]);
  });

  it("place_hold and settle_job do nothing unless confirm is true", async () => {
    const planned = JSON.parse(textOf(await client.callTool({ name: "plan_job", arguments: { brief: "collect 2 company records", budgetCents: 4_000 } }))) as {
      jobId: string;
      totalCents: number;
    };
    expect(planned.totalCents).toBe(4_000);

    const preview = JSON.parse(textOf(await client.callTool({ name: "place_hold", arguments: { jobId: planned.jobId } }))) as { executed: boolean };
    expect(preview.executed).toBe(false);
    const before = JSON.parse(textOf(await client.callTool({ name: "get_activity", arguments: {} }))) as { entries: { type: string }[] };
    expect(before.entries.some((e) => e.type === "authorize")).toBe(false);

    const held = JSON.parse(
      textOf(await client.callTool({ name: "place_hold", arguments: { jobId: planned.jobId, confirm: true } })),
    ) as { executed: boolean; status: string };
    expect(held.executed).toBe(true);
    expect(held.status).toBe("authorized");

    const blocked = JSON.parse(
      textOf(await client.callTool({ name: "settle_job", arguments: { jobId: planned.jobId, body: "" } })),
    ) as { executed: boolean };
    expect(blocked.executed).toBe(false);
    const mid = JSON.parse(textOf(await client.callTool({ name: "get_activity", arguments: {} }))) as { entries: { type: string }[] };
    expect(mid.entries.some((e) => e.type === "capture")).toBe(false);

    const settled = JSON.parse(
      textOf(await client.callTool({ name: "settle_job", arguments: { jobId: planned.jobId, body: "", confirm: true } })),
    ) as { executed: boolean; status: string };
    expect(settled.executed).toBe(true);
    expect(settled.status).toBe("voided");
    const after = JSON.parse(textOf(await client.callTool({ name: "get_activity", arguments: {} }))) as { entries: { type: string }[] };
    expect(after.entries.some((e) => e.type === "capture")).toBe(false);
    expect(after.entries.some((e) => e.type === "void")).toBe(true);
  });
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PaypalSession } from "./session.js";

function jsonResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "tool failed";
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true as const };
}

/** MCP tools over the mock rail. place_hold and settle_job wait for confirm: true. */
export function createMcpServer(session = new PaypalSession()): McpServer {
  const server = new McpServer({ name: "vet402-paypal", version: "0.0.1" });

  server.registerTool(
    "plan_job",
    {
      description: "Draft a job from a brief. Counts may come from a template or from Claude. Every amount is recomputed in code. Does not place a hold.",
      inputSchema: {
        brief: z.string().min(1).max(280),
        budgetCents: z.number().int().positive(),
      },
    },
    async ({ brief, budgetCents }) => {
      try {
        return jsonResult(await session.plan(brief, budgetCents));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "place_hold",
    {
      description: "Place the PayPal hold for a planned job. Does nothing unless confirm is true.",
      inputSchema: {
        jobId: z.string().min(1),
        confirm: z.boolean().optional(),
      },
    },
    async ({ jobId, confirm }) => {
      try {
        return jsonResult(await session.placeHold(jobId, confirm));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "check_delivery",
    {
      description: "Judge one delivery against the fixed condition. Does not capture or void.",
      inputSchema: {
        body: z.string(),
        httpStatus: z.number().int().optional(),
        latencyMs: z.number().int().nonnegative().optional(),
      },
    },
    async ({ body, httpStatus, latencyMs }) => {
      try {
        return jsonResult(await session.checkDelivery({ body, httpStatus, latencyMs }));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "settle_job",
    {
      description: "Judge the delivery and capture or void. Does nothing unless confirm is true.",
      inputSchema: {
        jobId: z.string().min(1),
        confirm: z.boolean().optional(),
        body: z.string().optional(),
        httpStatus: z.number().int().optional(),
        latencyMs: z.number().int().nonnegative().optional(),
      },
    },
    async ({ jobId, confirm, body, httpStatus, latencyMs }) => {
      try {
        return jsonResult(
          await session.settle(jobId, confirm, {
            httpStatus: httpStatus ?? 200,
            body: body ?? "",
            latencyMs: latencyMs ?? 800,
          }),
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "emergency_stop",
    {
      description: "Stop new holds and void every open authorization.",
      inputSchema: {
        reason: z.string().max(120).optional(),
      },
    },
    async ({ reason }) => {
      try {
        return jsonResult(await session.stop(reason?.trim() || "owner pressed stop"));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    "get_activity",
    {
      description: "List ledger lines for this process: order, authorization, capture, void, and hash.",
      inputSchema: {},
    },
    async () => jsonResult(session.activity()),
  );

  return server;
}

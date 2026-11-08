/**
 * One live call on the score path and one on the plan path.
 * Prints one line each: whether the call returned and whether tool_use was read.
 * The key is never printed. Exit 2 when ANTHROPIC_API_KEY is missing.
 *
 *   npm run smoke:claude
 */
import { pathToFileURL } from "node:url";
import { COMPANY_RECORDS } from "./condition.js";
import { fetchClaudePlanTool } from "../src/plan/job.js";
import { fixCondition } from "../src/verify/condition.js";
import { claudeDetailFor } from "../src/verify/score.js";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const UNUSABLE = "scorer returned an unusable answer";

export async function runClaudeSmoke(options: {
  env: Record<string, string | undefined>;
  fetchImpl: FetchLike;
  log?: (line: string) => void;
}): Promise<number> {
  const key = options.env.ANTHROPIC_API_KEY?.trim() ?? "";
  if (key === "") return 2;
  const log = options.log ?? ((line: string) => console.log(line));
  const model = options.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5";
  const cond = fixCondition(COMPANY_RECORDS);
  let scoreRead = false;
  try {
    await claudeDetailFor(cond, key, options.fetchImpl, model)({
      conditionDescription: cond.spec.description,
      data: {
        records: [
          {
            name: "Kizuna Logistics",
            country: "JP",
            employees: 120,
            founded: 1998,
            source_url: "https://registry.example.org/c/1",
          },
        ],
      },
    });
    log("score: called, read tool_use");
    scoreRead = true;
  } catch (err) {
    log(err instanceof Error && err.message === UNUSABLE ? "score: called, could not read tool_use" : "score: call failed");
  }
  let planRead = false;
  try {
    planRead = await fetchClaudePlanTool("collect 2 company records", key, options.fetchImpl, model);
    log(planRead ? "plan: called, read tool_use" : "plan: called, could not read tool_use");
  } catch {
    log("plan: call failed");
  }
  return scoreRead && planRead ? 0 : 1;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exit(await runClaudeSmoke({ env: process.env, fetchImpl: (url, init) => fetch(url, init) }));
}

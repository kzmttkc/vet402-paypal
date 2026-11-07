import type { ConditionSpec } from "../src/verify/condition.js";

/** The job used in the eval and the demo: "collect company records". */
export const COMPANY_RECORDS: ConditionSpec = {
  version: 1,
  description: "A list of companies with name, ISO country code, employee count, founding year and a source URL.",
  fields: {
    records: "array",
    "records[].name": "string",
    "records[].country": "string",
    "records[].employees": "integer",
    "records[].founded": "integer",
    "records[].source_url": "string",
  },
  minItems: { records: 1 },
  ranges: {
    "records[].employees": { min: 1, max: 5_000_000 },
    "records[].founded": { min: 1800, max: 2026 },
  },
  patterns: {
    "records[].name": "[\\p{L}\\p{N}&.,' -]{1,80}",
    "records[].country": "[A-Z]{2}",
    "records[].source_url": "https://[^\\s\"<>]{3,200}",
  },
  ai: { passAt: 0.9, voidBelow: 0.6 },
  maxLatencyMs: 15_000,
};

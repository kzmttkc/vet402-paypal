import type { Delivery } from "../verify/judge.js";

/** The honest body used by the demo. Amounts never come from this text. */
const HONEST_RECORDS = {
  records: [
    { name: "Kizuna Logistics", country: "JP", employees: 120, founded: 1998, source_url: "https://registry.example.org/c/1" },
    { name: "Northwind Foods", country: "US", employees: 4500, founded: 1972, source_url: "https://registry.example.org/c/2" },
  ],
};

export const HONEST_BODY = JSON.stringify(HONEST_RECORDS);

export type DeliveryMode = "honest" | "empty" | "unsure";

export function deliveryFor(mode: DeliveryMode): Delivery {
  if (mode === "empty") return { httpStatus: 200, body: "", latencyMs: 400 };
  if (mode === "unsure") return { httpStatus: 200, body: HONEST_BODY, latencyMs: 20_000 };
  return { httpStatus: 200, body: HONEST_BODY, latencyMs: 800 };
}

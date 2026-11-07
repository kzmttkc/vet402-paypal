import { COMPANY_EXEMPLARS } from "./company-shape.js";

/**
 * Qwen3 answers committed in docs/held-out-qwen3-2026-11-07.json.
 * The static page cannot run that model (569,789,750 bytes, past the 120,000,000 byte limit).
 * Exact generator names are not in that file. The published eval captured them, and a capture required a yes.
 */
const HELD_OUT_ANSWERS: Record<string, "yes" | "no"> = {
  "Toyota Motor": "yes",
  "Sony Group": "yes",
  "Mitsubishi Heavy Industries": "yes",
  "SoftBank Group": "yes",
  "Hitachi Ltd": "yes",
  "Panasonic Holdings": "yes",
  "Nintendo Co": "yes",
  "Honda Motor": "yes",
  "Canon Inc": "yes",
  "Fujitsu Limited": "yes",
  Unilever: "yes",
  Nestle: "yes",
  Siemens: "yes",
  "Samsung Electronics": "yes",
  "Hyundai Motor": "yes",
  Bosch: "yes",
  Airbus: "yes",
  Maersk: "yes",
  Caterpillar: "no",
  "John Deere": "yes",
  FedEx: "yes",
  UPS: "yes",
  "DHL Express": "yes",
  IKEA: "yes",
  Patagonia: "no",
  Stripe: "yes",
  Shopify: "yes",
  Adobe: "yes",
  Salesforce: "yes",
  ASML: "yes",
  "Tuesday Sunrise": "no",
  "Glass of Milk": "no",
  "Wooden Chair": "no",
  "Red Bicycle": "no",
  "Paper Notebook": "no",
  "Kitchen Sponge": "yes",
  "Cotton Socks": "no",
  "Green Tea": "no",
  "Bus Ticket": "no",
  "Rain Gauge": "no",
  "Maple Leaf": "yes",
  "Salt Shaker": "yes",
  "Door Hinge": "yes",
  "Yellow Pencil": "no",
  "Train Timetable": "no",
  "Ceramic Bowl": "no",
  "Hiking Boot": "yes",
  "Window Curtain": "no",
  "Garden Hose": "no",
  "Library Card": "no",
  "Birthday Cake": "no",
  "Steel Ruler": "no",
  "Postage Stamp": "no",
  "Alarm Clock": "no",
  "River Pebble": "yes",
  "Wool Scarf": "no",
  "Desk Lamp": "no",
  "Monday Forecast": "yes",
  "Miso Ramen": "yes",
  "Wireless Mouse": "yes",
};

/** Recorded yes, recorded no, or null when this page has no Qwen3 answer for the string. */
export function recordedCompanyAnswer(name: string): "yes" | "no" | null {
  const saved = HELD_OUT_ANSWERS[name];
  if (saved) return saved;
  if ((COMPANY_EXEMPLARS as readonly string[]).includes(name)) return "yes";
  return null;
}

export function heldOutAnswers(): Record<string, "yes" | "no"> {
  return HELD_OUT_ANSWERS;
}

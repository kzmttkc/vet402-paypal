/**
 * Names for the Qwen3 check that were not used to build OFF_TOPIC_NAMES.
 *
 * Written by hand on 2026-11-07.
 * Company names: 30 real operating companies, in the English form used on their
 * own sites, none of which appear in the generator list `NAMES` in eval/cases.ts.
 * Not-company names: 27 noun phrases for weather, food, and household objects,
 * written the same day, plus the three phrases Qwen3 called companies on
 * 2026-11-07 and which were therefore left out of OFF_TOPIC_NAMES
 * (Monday Forecast, Miso Ramen, Wireless Mouse).
 * None of the 60 appear in OFF_TOPIC_NAMES. None of the 30 companies appear in NAMES.
 */

export interface HeldOutName {
  text: string;
  truth: "company" | "not_company";
  /** Qwen3 answered yes to this phrase on 2026-11-07, so it was kept out of the 12-name list. */
  leftOutOfList?: boolean;
}

export const HELD_OUT_NAMES: readonly HeldOutName[] = [
  { text: "Toyota Motor", truth: "company" },
  { text: "Sony Group", truth: "company" },
  { text: "Mitsubishi Heavy Industries", truth: "company" },
  { text: "SoftBank Group", truth: "company" },
  { text: "Hitachi Ltd", truth: "company" },
  { text: "Panasonic Holdings", truth: "company" },
  { text: "Nintendo Co", truth: "company" },
  { text: "Honda Motor", truth: "company" },
  { text: "Canon Inc", truth: "company" },
  { text: "Fujitsu Limited", truth: "company" },
  { text: "Unilever", truth: "company" },
  { text: "Nestle", truth: "company" },
  { text: "Siemens", truth: "company" },
  { text: "Samsung Electronics", truth: "company" },
  { text: "Hyundai Motor", truth: "company" },
  { text: "Bosch", truth: "company" },
  { text: "Airbus", truth: "company" },
  { text: "Maersk", truth: "company" },
  { text: "Caterpillar", truth: "company" },
  { text: "John Deere", truth: "company" },
  { text: "FedEx", truth: "company" },
  { text: "UPS", truth: "company" },
  { text: "DHL Express", truth: "company" },
  { text: "IKEA", truth: "company" },
  { text: "Patagonia", truth: "company" },
  { text: "Stripe", truth: "company" },
  { text: "Shopify", truth: "company" },
  { text: "Adobe", truth: "company" },
  { text: "Salesforce", truth: "company" },
  { text: "ASML", truth: "company" },
  { text: "Tuesday Sunrise", truth: "not_company" },
  { text: "Glass of Milk", truth: "not_company" },
  { text: "Wooden Chair", truth: "not_company" },
  { text: "Red Bicycle", truth: "not_company" },
  { text: "Paper Notebook", truth: "not_company" },
  { text: "Kitchen Sponge", truth: "not_company" },
  { text: "Cotton Socks", truth: "not_company" },
  { text: "Green Tea", truth: "not_company" },
  { text: "Bus Ticket", truth: "not_company" },
  { text: "Rain Gauge", truth: "not_company" },
  { text: "Maple Leaf", truth: "not_company" },
  { text: "Salt Shaker", truth: "not_company" },
  { text: "Door Hinge", truth: "not_company" },
  { text: "Yellow Pencil", truth: "not_company" },
  { text: "Train Timetable", truth: "not_company" },
  { text: "Ceramic Bowl", truth: "not_company" },
  { text: "Hiking Boot", truth: "not_company" },
  { text: "Window Curtain", truth: "not_company" },
  { text: "Garden Hose", truth: "not_company" },
  { text: "Library Card", truth: "not_company" },
  { text: "Birthday Cake", truth: "not_company" },
  { text: "Steel Ruler", truth: "not_company" },
  { text: "Postage Stamp", truth: "not_company" },
  { text: "Alarm Clock", truth: "not_company" },
  { text: "River Pebble", truth: "not_company" },
  { text: "Wool Scarf", truth: "not_company" },
  { text: "Desk Lamp", truth: "not_company" },
  { text: "Monday Forecast", truth: "not_company", leftOutOfList: true },
  { text: "Miso Ramen", truth: "not_company", leftOutOfList: true },
  { text: "Wireless Mouse", truth: "not_company", leftOutOfList: true },
];

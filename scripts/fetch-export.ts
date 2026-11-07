/**
 * Refresh the frozen copy of the public export (GET only, no key).
 *   npm run fetch:export
 * Everything else reads data/observatory_export.csv and checks it against the sha256 in the meta file.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseCsvObjects } from "../src/sellers/csv.js";
import { DATA_DIR, EXPORT_URL, FROZEN_CSV, FROZEN_META, type FrozenMeta } from "../src/sellers/load.js";

const res = await fetch(EXPORT_URL, { method: "GET", redirect: "follow" });
if (!res.ok) throw new Error(`GET ${EXPORT_URL} → ${res.status}`);
const buf = Buffer.from(await res.arrayBuffer());
const rows = parseCsvObjects(buf.toString("utf8")).length;
const meta: FrozenMeta = {
  url: EXPORT_URL,
  fetchedAt: new Date().toISOString(),
  bytes: buf.length,
  rows,
  sha256: createHash("sha256").update(buf).digest("hex"),
};
mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(FROZEN_CSV, buf);
writeFileSync(FROZEN_META, JSON.stringify(meta, null, 2) + "\n");
console.log(`frozen ${rows} rows, ${buf.length} bytes, sha256 ${meta.sha256}`);

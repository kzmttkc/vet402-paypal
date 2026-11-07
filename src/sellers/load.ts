import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsvObjects } from "./csv.js";
import type { ExportRow } from "./aggregate.js";

export const EXPORT_URL = "https://vet402.com/api/v1/observatory/export.csv?days=365";
export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
export const FROZEN_CSV = join(DATA_DIR, "observatory_export.csv");
export const FROZEN_META = join(DATA_DIR, "observatory_export.meta.json");

export interface FrozenMeta {
  url: string;
  fetchedAt: string;
  bytes: number;
  rows: number;
  sha256: string;
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** Read the frozen copy. Refuses to load if the file no longer matches its recorded sha256. */
export function loadFrozenExport(csvPath = FROZEN_CSV, metaPath = FROZEN_META): { rows: ExportRow[]; meta: FrozenMeta } {
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as FrozenMeta;
  const actual = sha256File(csvPath);
  if (actual !== meta.sha256) throw new Error(`frozen export changed: sha256 ${actual} ≠ recorded ${meta.sha256}`);
  const rows = parseCsvObjects(readFileSync(csvPath, "utf8")) as unknown as ExportRow[];
  if (rows.length !== meta.rows) throw new Error(`frozen export has ${rows.length} rows, meta says ${meta.rows}`);
  return { rows, meta };
}

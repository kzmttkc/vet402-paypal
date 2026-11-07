import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

/** Value imports and dynamic imports. `import type` is erased and does not ship. */
function specsIn(source: string): string[] {
  const specs: string[] = [];
  const from = /\bfrom\s+["']([^"']+)["']/g;
  const dynamic = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  const statements = source.split(/\n(?=import |export )/);
  for (const statement of statements) {
    if (/^\s*import\s+type\s/.test(statement) || /^\s*export\s+type\s/.test(statement)) continue;
    for (const match of statement.matchAll(from)) {
      if (match[1]) specs.push(match[1]);
    }
  }
  for (const match of source.matchAll(dynamic)) {
    if (match[1]) specs.push(match[1]);
  }
  return specs;
}

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  const stripped = base.replace(/\.js$/, "");
  const candidates = [`${stripped}.ts`, `${stripped}.tsx`, `${stripped}.js`, base];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function reachable(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const spec of specsIn(source)) {
      if (spec.startsWith("node:")) continue;
      const next = resolveSpec(file, spec);
      if (next && next.startsWith(root) && !next.includes("/node_modules/")) queue.push(next);
    }
  }
  return [...seen];
}

function nodeImports(file: string): string[] {
  return specsIn(readFileSync(file, "utf8")).filter((spec) => spec.startsWith("node:"));
}

describe("dev screen bundle", () => {
  it("does not statically import Node built-ins from the browser entry", () => {
    const entry = resolve(root, "web/src/main.tsx");
    const files = reachable(entry);
    const hits = files.flatMap((file) => nodeImports(file).map((spec) => `${file} → ${spec}`));
    expect(hits).toEqual([]);
    const transformers = files.filter((file) => readFileSync(file, "utf8").includes("@huggingface/transformers"));
    expect(transformers).toEqual([]);
  });

  it("hashes with the pure function, not node:crypto", () => {
    const ledger = readFileSync(resolve(root, "src/ledger/index.ts"), "utf8");
    expect(ledger).not.toContain("node:crypto");
    expect(ledger).toContain("../hash/sha256.js");
  });
});

/** Walk a condition path. "records[].name" visits that key on every element. */
export function valuesAt(root: unknown, path: string): { found: boolean; values: unknown[] } {
  const parts = path.split(".");
  let current: unknown[] = [root];
  for (const raw of parts) {
    const isEach = raw.endsWith("[]");
    const key = isEach ? raw.slice(0, -2) : raw;
    const next: unknown[] = [];
    for (const node of current) {
      if (node === null || typeof node !== "object" || Array.isArray(node) || !Object.hasOwn(node, key)) {
        return { found: false, values: [] };
      }
      const v = (node as Record<string, unknown>)[key];
      if (isEach) {
        if (!Array.isArray(v)) return { found: false, values: [] };
        next.push(...v);
      } else next.push(v);
    }
    current = next;
  }
  return { found: true, values: current };
}

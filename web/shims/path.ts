/** Enough of node:path for modules that only build a path and never read it. */
export function join(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join("/");
}

export function dirname(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "." : path.slice(0, cut);
}

export function resolve(...parts: string[]): string {
  return join(...parts);
}

export function extname(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot);
}

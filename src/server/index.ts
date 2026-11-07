import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const WEB_ROOT = resolve(process.cwd(), "dist", "web");

function safeFile(urlPath: string): string | null {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const rel = decoded.replace(/^\/+/, "");
  if (rel.includes("\0")) return null;
  const abs = resolve(WEB_ROOT, rel);
  if (abs !== WEB_ROOT && !abs.startsWith(WEB_ROOT + "/")) return null;
  return abs;
}

const rawPort = process.env.PORT ?? "8787";
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer from 1 to 65535");
}

const app = createApp();

app.get("*", async (c) => {
  const path = c.req.path;
  if (path.startsWith("/api")) return c.notFound();
  const abs = safeFile(path === "/" ? "/index.html" : path);
  if (abs && existsSync(abs) && statSync(abs).isFile()) {
    const buf = new Uint8Array(await readFile(abs));
    return c.body(buf, 200, { "content-type": MIME[extname(abs)] ?? "application/octet-stream" });
  }
  const index = join(WEB_ROOT, "index.html");
  if (existsSync(index) && !path.includes(".")) {
    return c.html(await readFile(index, "utf8"));
  }
  return c.text("The screen is not built yet. Run npm run build, or npm run dev.", 404);
});

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on ${info.port}`);
});

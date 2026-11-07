/** npm run dev — API on 8787, screen on http://127.0.0.1:5173 */
import { spawn, type ChildProcess } from "node:child_process";

const children: ChildProcess[] = [];

function shutdown(code = 0): void {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

function run(args: string[], env: NodeJS.ProcessEnv): void {
  const child = spawn(process.execPath, args, { stdio: "inherit", env });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (signal) return;
    if (code && code !== 0) shutdown(code);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run(["--import", "tsx", "src/server/index.ts"], { ...process.env, PORT: "8787" });
run(
  ["node_modules/vite/bin/vite.js", "--config", "web/vite.config.ts", "--host", "127.0.0.1", "--port", "5173"],
  process.env,
);
console.log("open http://127.0.0.1:5173");

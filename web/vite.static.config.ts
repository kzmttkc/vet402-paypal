import { renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const root = fileURLToPath(new URL(".", import.meta.url));
const shim = (name: string) => fileURLToPath(new URL(`./shims/${name}.ts`, import.meta.url));

function pagesReady(): Plugin {
  return {
    name: "pages-ready",
    transformIndexHtml(html) {
      // crossorigin blocks the module when the page is opened as a file.
      return html.replaceAll(" crossorigin", "");
    },
    closeBundle() {
      const dir = fileURLToPath(new URL("../dist-static/", import.meta.url));
      renameSync(`${dir}index.static.html`, `${dir}index.html`);
      writeFileSync(`${dir}.nojekyll`, "");
    },
  };
}

/** A file:// and GitHub Pages build. Relative assets, no server, mock rail in the page. */
export default defineConfig({
  root,
  base: "./",
  plugins: [react(), pagesReady()],
  resolve: {
    alias: [
      { find: "node:crypto", replacement: shim("crypto") },
      { find: "node:fs/promises", replacement: shim("fs") },
      { find: "node:fs", replacement: shim("fs") },
      { find: "node:path", replacement: shim("path") },
      { find: "node:url", replacement: shim("url") },
      { find: "@huggingface/transformers", replacement: shim("transformers") },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL("../dist-static", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./index.static.html", import.meta.url)),
    },
  },
});

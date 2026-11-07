import { defineConfig } from "vitest/config";

// Default suite: no keys, no network. test/no-network.ts makes any fetch fail loudly.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/no-network.ts"],
  },
});

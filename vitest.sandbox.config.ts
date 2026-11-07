import { defineConfig } from "vitest/config";

// npm run test:sandbox — calls the real PayPal sandbox with the keys in .env.
export default defineConfig({
  test: {
    include: ["test-sandbox/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

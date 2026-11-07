// The default suite must never reach the network. Any fetch here is a test bug.
import { useEmbedder } from "../src/verify/score.js";

globalThis.fetch = (async (input: unknown) => {
  throw new Error(`network is disabled in npm test (tried ${String(input)})`);
}) as typeof fetch;

// Same vector for every text: similarity is 1, and no model is downloaded.
useEmbedder(async () => Float32Array.of(1, 0, 0));

// The default suite must never reach the network. Any fetch here is a test bug.
import { OFF_TOPIC_NAMES } from "../eval/cases.js";
import { useCompanyShape } from "../src/verify/company-shape.js";
import { useLanguageAsk } from "../src/verify/language.js";
import { useEmbedder } from "../src/verify/score.js";

globalThis.fetch = (async (input: unknown) => {
  throw new Error(`network is disabled in npm test (tried ${String(input)})`);
}) as typeof fetch;

// Same vector for every text: similarity is 1, and no model is downloaded.
useEmbedder(async () => Float32Array.of(1, 0, 0));
// The default scorer asks Qwen3. Tests answer "yes" and never download it.
useLanguageAsk(async () => "Yes.");
// The second check agrees with the fixed list. It does not download an embedding.
useCompanyShape(async (name) => !(OFF_TOPIC_NAMES as readonly string[]).includes(name));

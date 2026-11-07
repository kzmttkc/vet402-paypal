import { COMPANY_RECORDS } from "../../eval/condition.js";
import { scoreModelLine, type PageScorePhase } from "../../src/i18n/copy.js";
import { fixCondition } from "../../src/verify/condition.js";
import { embeddingCompanyShape } from "../../src/verify/company-shape.js";
import type { Scorer } from "../../src/verify/judge.js";
import { scorePageDelivery } from "../../src/verify/page-score.js";

type Progress = { status?: string; loaded?: number; total?: number };
type Extractor = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data?: ArrayLike<number> }>;
type TransformersModule = {
  env: { allowLocalModels: boolean };
  pipeline: (task: string, model: string, opts: { progress_callback?: (info: Progress) => void }) => Promise<Extractor>;
};

/** all-MiniLM-L6-v2. The language model is too large for this page. */
const EMBEDDING_MODEL = "onnx-community/all-MiniLM-L6-v2-ONNX";

let phase: PageScorePhase = { phase: "download", ratio: 0 };
const listeners = new Set<(next: PageScorePhase) => void>();
let loading: Promise<Scorer> | null = null;

function publish(next: PageScorePhase): void {
  phase = next;
  for (const listener of listeners) listener(next);
}

export function subscribePageScore(listener: (next: PageScorePhase) => void): () => void {
  listeners.add(listener);
  listener(phase);
  return () => listeners.delete(listener);
}

export function pageScoreLine(lang: "en" | "ja"): string {
  return scoreModelLine(lang, phase);
}

/**
 * The embedding model did not load. A filled-in body used to score as 1 and
 * stamp CAPTURED. This page has not scored anything, so it does not capture.
 */
export function scoreWhenModelMissing(): number {
  return 0;
}

/** Starts the embedding download once. Safe to call again. */
export function startPageScorer(): Promise<Scorer> {
  if (!loading) loading = loadEmbeddingScorer();
  return loading;
}

/** Waits for the embedding model, then scores. Tests do not call this. */
export const pageScorer: Scorer = async (input) => (await startPageScorer())(input);

async function loadEmbeddingScorer(): Promise<Scorer> {
  publish({ phase: "download", ratio: 0 });
  try {
    const transformers = (await import("@huggingface/transformers")) as unknown as TransformersModule;
    transformers.env.allowLocalModels = false;
    const extractor = await transformers.pipeline("feature-extraction", EMBEDDING_MODEL, {
      progress_callback: (info) => {
        if (info.status !== "progress" || !info.total || info.loaded === undefined) return;
        publish({ phase: "download", ratio: Math.max(0, Math.min(1, info.loaded / info.total)) });
      },
    });
    publish({ phase: "ready" });
    const cond = fixCondition(COMPANY_RECORDS);
    const embed = async (text: string) => {
      const out = await extractor(text, { pooling: "mean", normalize: true });
      if (!out.data || out.data.length === 0) throw new Error("embedding model returned no vector");
      return out.data;
    };
    const shape = (name: string) => embeddingCompanyShape(name, embed);
    return async (input) => scorePageDelivery(cond.spec, input.data, shape);
  } catch {
    publish({ phase: "failed" });
    return async () => scoreWhenModelMissing();
  }
}

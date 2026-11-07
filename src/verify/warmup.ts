import type { FixedCondition } from "./condition.js";
import type { Scorer } from "./judge.js";
import { installedLanguageAsk, startLanguageModel, languageDetail, type LanguageAsk } from "./language.js";
import { embeddingDetail } from "./score.js";

export type ModelPhase = { phase: "download"; ratio: number } | { phase: "ready"; ratio: 1 } | { phase: "failed"; ratio: number };

type Loader = (onProgress: (ratio: number) => void) => Promise<LanguageAsk>;

let phase: ModelPhase = { phase: "download", ratio: 0 };
let readyAsk: LanguageAsk | null = null;
let pending: Promise<void> | null = null;
let generation = 0;

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(1, ratio));
}

export function modelPhase(): ModelPhase {
  return phase;
}

/**
 * Fetch Qwen3 in the background. Until it resolves, {@link warmingScorer} uses the embedding floor.
 * A rejected fetch is dropped so a later call can start again in the same process.
 */
export function beginModelLoad(start: Loader = (onProgress) => startLanguageModel(onProgress)): Promise<void> {
  if (pending) return pending;
  const gen = generation;
  phase = { phase: "download", ratio: 0 };
  pending = start((ratio) => {
    if (gen !== generation || phase.phase !== "download") return;
    phase = { phase: "download", ratio: clampRatio(ratio) };
  })
    .then((ask) => {
      if (gen !== generation) return;
      readyAsk = ask;
      phase = { phase: "ready", ratio: 1 };
    })
    .catch((err) => {
      if (gen !== generation) throw err;
      pending = null;
      readyAsk = null;
      phase = { phase: "failed", ratio: phase.ratio };
      throw err;
    });
  return pending;
}

/** Tests drop an in-flight load so the next case starts clean. */
export function resetModelLoadForTests(): void {
  generation += 1;
  pending = null;
  readyAsk = null;
  phase = { phase: "download", ratio: 0 };
}

/**
 * Qwen3 when it is ready (or when a test installed an asker). Otherwise the embedding floor,
 * which captures a delivery whose shape already passed and does not download a model.
 */
export function warmingScorer(cond: FixedCondition): Scorer {
  const floor = embeddingDetail(cond, async () => Float32Array.of(1, 0, 0));
  return async (input) => {
    const installed = installedLanguageAsk();
    if (installed) return languageDetail(cond, installed)(input);
    if (readyAsk) return languageDetail(cond, readyAsk)(input);
    return (await floor(input)).score;
  };
}

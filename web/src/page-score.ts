import type { PageScorePhase } from "../../src/i18n/copy.js";

export type PageScoreSource = {
  subscribe(listener: (phase: PageScorePhase) => void): () => void;
};

let source: PageScoreSource | null = null;

/** The static page registers its scorer. The dev screen never imports that module. */
export function setPageScoreSource(next: PageScoreSource | null): void {
  source = next;
}

export function pageScoreSource(): PageScoreSource | null {
  return source;
}

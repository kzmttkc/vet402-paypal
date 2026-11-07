import type { Copy } from "../../../src/i18n/copy.js";
import { FROZEN_EXPORT } from "../../../src/demo/nov7.js";

function commas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const CLIPS = [
  { key: "4xx", n: FROZEN_EXPORT.paid4xx, field: "clip4xx", className: "clip clip-4xx" },
  { key: "5xx", n: FROZEN_EXPORT.paid5xx, field: "clip5xx", className: "clip clip-5xx" },
  { key: "shape", n: FROZEN_EXPORT.shape, field: "clipShape", className: "clip clip-shape" },
  { key: "late", n: FROZEN_EXPORT.late, field: "clipLate", className: "clip clip-late" },
] as const;

export function Evidence({ copy }: { copy: Copy }) {
  return (
    <section className="evidence" data-testid="failure-evidence" aria-labelledby="evidence-heading">
      <p className="figure-label">{copy.evidenceFigure}</p>
      <h2 id="evidence-heading">{copy.evidenceHeading}</h2>
      <p className="evidence-lead">
        {commas(FROZEN_EXPORT.settled)} {copy.evidenceSettled} {commas(FROZEN_EXPORT.broken)} {copy.evidenceBroken}
      </p>
      <div className="clips">
        {CLIPS.map((clip) => (
          <article key={clip.key} className={clip.className}>
            <h3>
              <span className="clip-n">{commas(clip.n)}</span>
              {copy[clip.field]}
            </h3>
          </article>
        ))}
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import type { Copy } from "../../../src/i18n/copy.js";
import { FROZEN_EXPORT, tickerLine } from "../../../src/demo/nov7.js";
import { formatUsd } from "../../../src/policy/money.js";
import type { TruthResult } from "../../../src/pay/truth.js";

function commas(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function Hero({
  copy,
  busy,
  stopped,
  result,
  onPlay,
  onReplay,
}: {
  copy: Copy;
  busy: boolean;
  stopped: boolean;
  result: TruthResult | null;
  onPlay: () => void;
  onReplay: () => void;
}) {
  const [shownCents, setShownCents] = useState(0);

  useEffect(() => {
    if (!result) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShownCents(result.capturedCents);
      return;
    }
    let current = 0;
    let frame = 0;
    const tick = () => {
      if (current === result.capturedCents) return;
      const delta = result.capturedCents - current;
      const step = Math.max(1, Math.round(Math.abs(delta) * 0.28));
      current += Math.sign(delta) * Math.min(Math.abs(delta), step);
      setShownCents(current);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  useEffect(() => {
    if (!result) return;
    document.querySelector("[data-testid=hero-result]")?.scrollIntoView({ block: "nearest" });
  }, [result]);

  const resultLine = result
    ? `Captured ${formatUsd(shownCents)} of ${formatUsd(result.holdCents)}. ${formatUsd(Math.max(0, result.holdCents - shownCents))} released.`
    : null;

  return (
    <header className="hero" data-testid="hero">
      <h1 id="page-heading" data-testid="page-heading">
        {copy.heroTitle}
      </h1>
      <p className="hero-number" data-testid="hero-number">
        {commas(FROZEN_EXPORT.broken)}
      </p>
      <p className="hero-line" data-testid="hero-line">
        {copy.heroLine}
      </p>
      <hr className="rule" />
      <p className="band" data-testid="fact-ticker">
        {tickerLine()}
      </p>
      {resultLine ? (
        <p className="hero-result" data-testid="hero-result">
          {resultLine}
        </p>
      ) : null}
      <div className="hero-actions">
        <button type="button" className="play" data-testid="pay-per-truth-play" disabled={busy || stopped} onClick={onPlay}>
          {copy.truthPlay}
        </button>
        <button type="button" className="minor" data-testid="replay-nov7-button" onClick={onReplay}>
          {copy.replayButton}
        </button>
      </div>
    </header>
  );
}

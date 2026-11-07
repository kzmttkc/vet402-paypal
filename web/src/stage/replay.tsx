import { useEffect, useState } from "react";
import type { Copy } from "../../../src/i18n/copy.js";
import { REPLAY_EVENTS, type ReplayId } from "../../../src/demo/nov7.js";

const TITLE: Record<ReplayId, keyof Copy> = {
  start: "replayStart",
  a: "replayFull",
  gate1: "replayPartial",
  c: "replayVoid",
  d: "replayRefund",
  gate2: "replayAway",
  end: "replayEnd",
};

/** Plays the written record. It never calls the network. */
export function ReplayLog({ copy }: { copy: Copy }) {
  const [shown, setShown] = useState(1);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(REPLAY_EVENTS.length);
      return;
    }
    let count = 1;
    let pending = 0;
    const step = () => {
      count += 1;
      setShown(count);
      if (count < REPLAY_EVENTS.length) pending = window.setTimeout(step, 700);
    };
    pending = window.setTimeout(step, 700);
    return () => window.clearTimeout(pending);
  }, []);

  const events = REPLAY_EVENTS.slice(0, shown);
  return (
    <section className="replay" data-testid="replay-nov7" aria-label={copy.replayButton}>
      <p className="replay-note" data-testid="replay-note">
        {copy.replayNote}
      </p>
      <p className="replay-clock">{copy.replayClock}</p>
      <ol className="replay-log" data-testid="replay-log">
        {events.map((event) => (
          <li key={event.id} className="replay-step">
            <p className="replay-title">{String(copy[TITLE[event.id]])}</p>
            {event.at ? <time dateTime={event.at}>{event.at}</time> : null}
            <p className="replay-ids">{event.ids.join(" · ")}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

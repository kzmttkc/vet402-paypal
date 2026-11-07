import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScamKind, ScamResult, ScamWin } from "../../src/demo/scam.js";
import type { TruthResult } from "../../src/pay/truth.js";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { SIMULATED_BANNER, copyFor, langFromSearch, presentDecision, presentError, presentKind, presentReason, scoreLine, scoreModelLine, screenJob, type Copy, type Lang, type PageScorePhase } from "../../src/i18n/copy.js";
import { speechConstructor, startSpeechInput, type SpeechHost, type SpeechSession } from "../../src/speech/input.js";
import type { ActivityEntry, Health, JobView, ReviewRow } from "./types";
import { subscribePageScore } from "./local-score";
import { api } from "./transport";

type Autonomy = "careful" | "balanced" | "autopilot";
type Budget = 2000 | 5000 | 10000 | 20000;

const BUDGETS: { cents: Budget; label: string }[] = [
  { cents: 2000, label: "$20" },
  { cents: 5000, label: "$50" },
  { cents: 10000, label: "$100" },
  { cents: 20000, label: "$200" },
];

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 2.8v10.4L13.2 8 5 2.8z" fill="currentColor" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2" y="2" width="10" height="10" fill="currentColor" />
    </svg>
  );
}

function usd(cents: number): string {
  return `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function TruthTape({
  copy,
  busy,
  stopped,
  run,
  onPlay,
}: {
  copy: Copy;
  busy: boolean;
  stopped: boolean;
  run: TruthResult | null;
  onPlay: () => void;
}) {
  const [shown, setShown] = useState(0);
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    if (!run) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(run.rows.length);
      return;
    }
    setShown(0);
    const id = window.setInterval(() => {
      setShown((n) => {
        if (n >= run.rows.length) {
          window.clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 45);
    return () => window.clearInterval(id);
  }, [run]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [shown]);

  const rows = run?.rows.slice(0, shown) ?? [];
  const last = rows.at(-1);
  const finished = run !== null && shown >= run.rows.length;
  const captured = last?.capturedCents ?? 0;
  const released = last?.releasedCents ?? 0;

  return (
    <section data-testid="pay-per-truth" aria-labelledby="truth-title">
      <h2 id="truth-title">{copy.truthHeading}</h2>
      <p>{copy.truthLead}</p>
      <button
        type="button"
        className="play"
        data-testid="pay-per-truth-play"
        disabled={busy || stopped}
        onClick={onPlay}
      >
        <PlayIcon />
        {copy.truthPlay}
      </button>
      {run && (
        <>
          <div className="meters">
            <p className="meter">
              <span>{copy.truthCaptured}</span>
              <strong data-testid="pay-per-truth-captured">{usd(captured)}</strong>
            </p>
            <p className="meter">
              <span>{copy.truthReleased}</span>
              <strong data-testid="pay-per-truth-released">{usd(released)}</strong>
            </p>
          </div>
          <ol className="tape" ref={listRef} data-testid="pay-per-truth-tape">
            {rows.map((row) => (
              <li key={row.itemId}>
                <span>{row.name}</span>
                <span className={row.mark === "PASS" ? "mark-pass" : "mark-fail"}>{row.mark}</span>
              </li>
            ))}
          </ol>
          {finished && (
            <p className="summary" data-testid="pay-per-truth-line">
              {run.line}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function stampClass(status: string): string {
  if (status === "captured") return "stamp stamp-ok stamp-in";
  if (status === "voided") return "stamp stamp-no stamp-in";
  return "stamp stamp-wait";
}

function stampWord(status: string): string {
  if (status === "captured") return "CAPTURED";
  if (status === "voided") return "VOIDED";
  if (status === "needs_human") return "UNSURE";
  if (status === "authorized") return "HELD";
  return status.replaceAll("_", " ").toUpperCase();
}

function Side({
  who,
  job,
  statusId,
  summaryId,
}: {
  who: string;
  job: JobView;
  statusId?: string;
  summaryId?: string;
}) {
  return (
    <article className="side">
      <p className="who">{who}</p>
      <p className={stampClass(job.status)} data-testid={statusId}>
        {stampWord(job.status)}
      </p>
      <p className="summary" data-testid={summaryId}>
        {job.summary}
      </p>
      <ul>
        {job.items.map((item) => (
          <li key={item.itemId}>
            {item.label}: {item.progress}
          </li>
        ))}
      </ul>
    </article>
  );
}

function Slip({ job, copy, onHold, busy }: { job: JobView; copy: Copy; onHold: () => void; busy: boolean }) {
  const shape = Object.entries(job.condition.shape);
  const ranges = Object.entries(job.condition.ranges);
  return (
    <section className="slip" data-testid="approval-card" aria-labelledby="slip-title">
      <h2 id="slip-title">{copy.approval}</h2>
      <p>{job.brief}</p>
      <p className="tiny">
        {job.autonomy === "careful" && copy.careful}
        {job.autonomy === "balanced" && copy.balanced}
        {job.autonomy === "autopilot" && copy.autopilot}
      </p>
      <table className="split">
        <caption className="visually-hidden">{copy.paysFor}</caption>
        <tbody>
          {job.items.map((item) => (
            <tr key={item.itemId}>
              <th scope="row">{item.label}</th>
              <td>{item.price}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{copy.hold}</td>
            <td>{usd(job.holdCents)}</td>
          </tr>
        </tfoot>
      </table>
      <dl className="meta">
        <div>
          <dt>{copy.condition}</dt>
          <dd>
            <code data-testid="approval-condition-id">{job.conditionId}</code>
          </dd>
          <dd>{job.condition.description}</dd>
        </div>
        <div>
          <dt>{copy.shape}</dt>
          <dd>
            {shape.map(([path, type]) => (
              <span key={path}>
                {path}: {type}
                <br />
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>{copy.ranges}</dt>
          <dd>
            {ranges.map(([path, range]) => (
              <span key={path}>
                {path}: {range.min ?? "…"}–{range.max ?? "…"}
                <br />
              </span>
            ))}
          </dd>
        </div>
        <div>
          <dt>{copy.score}</dt>
          <dd>{scoreLine(copy.lang, job.condition.score.passAt, job.condition.score.voidBelow)}</dd>
        </div>
        <div>
          <dt>{copy.seller}</dt>
          <dd className="tiny">{job.sellerId}</dd>
          <dd className="seller-line" data-testid="approval-seller-line">
            {job.sellerLine}
          </dd>
        </div>
      </dl>
      <p className="ask" data-testid="approval-hold-question">
        {job.holdQuestion}
      </p>
      <p className="hold-reason" data-testid="approval-hold-reason">
        {job.holdReason}
      </p>
      {job.status === "planned" && (
        <button type="button" className="yes" onClick={onHold} disabled={busy}>
          {copy.placeHold}
        </button>
      )}
      {job.status !== "planned" && (
        <>
          <p className={stampClass(job.status)}>{stampWord(job.status)}</p>
          <p className="summary">{job.summary}</p>
          <ul className="progress">
            {job.items.map((item) => (
              <li key={item.itemId}>
                {item.label}: {item.progress}
              </li>
            ))}
          </ul>
          {job.orderId && <p className="tiny">{copy.order} {job.orderId}</p>}
          {job.authorizationId && <p className="tiny">{copy.authorization} {job.authorizationId}</p>}
          {job.captureId && <p className="tiny">{copy.captureId} {job.captureId}</p>}
        </>
      )}
    </section>
  );
}

function ActionCell(props: ICellRendererParams<ReviewRow, unknown, { onDecide: (row: ReviewRow, decision: "capture" | "void") => void; copy: Copy }>) {
  const row = props.data;
  const copy = props.context.copy;
  if (!row) return null;
  if (row.decision !== "open") return <span>{presentDecision(copy.lang, row.decision)}</span>;
  return (
    <div className="cell-actions">
      <button type="button" onClick={() => props.context.onDecide(row, "capture")}>
        {copy.capture}
      </button>
      <button type="button" onClick={() => props.context.onDecide(row, "void")}>
        {copy.void}
      </button>
    </div>
  );
}

const SCAM_PRESETS: { id: ScamKind; label: (copy: Copy) => string }[] = [
  { id: "empty", label: (copy) => copy.scamEmpty },
  { id: "wrong_type", label: (copy) => copy.scamWrongType },
  { id: "missing_field", label: (copy) => copy.scamMissing },
  { id: "out_of_range", label: (copy) => copy.scamRange },
  { id: "instruction", label: (copy) => copy.scamInstruction },
  { id: "not_company", label: (copy) => copy.scamName },
  { id: "late", label: (copy) => copy.scamLate },
];

function scamStamp(outcome: string): string {
  if (outcome === "capture") return "stamp stamp-ok stamp-in";
  if (outcome === "void") return "stamp stamp-no stamp-in";
  return "stamp stamp-wait";
}

function ScamBench({
  copy,
  busy,
  stopped,
  result,
  wins,
  onSend,
}: {
  copy: Copy;
  busy: boolean;
  stopped: boolean;
  result: (ScamResult & { wins: ScamWin[] }) | null;
  wins: ScamWin[];
  onSend: (kind: ScamKind, text: string) => void;
}) {
  const [kind, setKind] = useState<ScamKind>("empty");
  const [text, setText] = useState("");
  const usesNote = kind === "instruction" || kind === "not_company";
  return (
    <section data-testid="scam-bench" aria-labelledby="scam-title">
      <h2 id="scam-title">{copy.scamHeading}</h2>
      <p>{copy.scamLead}</p>
      <fieldset>
        <legend>{copy.scamHeading}</legend>
        <div className="choices">
          {SCAM_PRESETS.map((preset) => (
            <label key={preset.id}>
              <input
                type="radio"
                name="scam-kind"
                value={preset.id}
                checked={kind === preset.id}
                onChange={() => setKind(preset.id)}
              />
              <span>{preset.label(copy)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block" htmlFor="scam-text">
        {copy.scamNote}
      </label>
      <textarea
        id="scam-text"
        value={text}
        maxLength={200}
        disabled={!usesNote}
        onChange={(event) => setText(event.target.value)}
      />
      <button
        type="button"
        className="play"
        data-testid="scam-send"
        disabled={busy || stopped}
        onClick={() => onSend(kind, usesNote ? text : "")}
      >
        {copy.scamSend}
      </button>
      {result && (
        <article className="side" data-testid="scam-result">
          <p className={scamStamp(result.outcome)} data-testid="scam-outcome">
            {result.outcome.toUpperCase()}
          </p>
          <p data-testid="scam-reason">{result.reason}</p>
          <p className="summary" data-testid="scam-amount">
            {copy.scamAmount} {result.amount}
          </p>
        </article>
      )}
      {wins.length > 0 && (
        <>
          <p>{copy.scamWins}</p>
          <pre className="win-log" data-testid="scam-wins">
            {JSON.stringify(wins, null, 2)}
          </pre>
        </>
      )}
    </section>
  );
}

export function App({ simulated = false }: { simulated?: boolean }) {
  const [lang] = useState<Lang>(() => langFromSearch(window.location.search));
  const copy = copyFor(lang);
  const [health, setHealth] = useState<Health | null>(simulated ? { ok: true, rail: "mock", stopped: false } : null);
  const [brief, setBrief] = useState(copy.sampleBrief);
  const [budget, setBudget] = useState<Budget>(5000);
  const [autonomy, setAutonomy] = useState<Autonomy>("careful");
  const [sellerMode, setSellerMode] = useState<"established" | "new">("established");
  const [job, setJob] = useState<JobView | null>(null);
  const [demo, setDemo] = useState<{ left: JobView; right: JobView } | null>(null);
  const [truth, setTruth] = useState<TruthResult | null>(null);
  const [scam, setScam] = useState<(ScamResult & { wins: ScamWin[] }) | null>(null);
  const [scamWins, setScamWins] = useState<ScamWin[]>(() => {
    try {
      const raw = localStorage.getItem("vet402-scam-wins");
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed) ? (parsed as ScamWin[]) : [];
    } catch {
      return [];
    }
  });
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [chains, setChains] = useState<{ jobId: string; headHash: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [scorePhase, setScorePhase] = useState<PageScorePhase | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const canSpeak = speechConstructor(window as unknown as SpeechHost) !== null;

  useEffect(() => {
    if (!scam?.win) return;
    setScamWins((prev) => {
      if (prev.some((win) => win.id === scam.win?.id)) return prev;
      const next = [...prev, scam.win!];
      try {
        localStorage.setItem("vet402-scam-wins", JSON.stringify(next));
      } catch {
        /* the list on screen is enough */
      }
      return next;
    });
  }, [scam]);

  useEffect(() => {
    document.documentElement.lang = copy.htmlLang;
    document.title = copy.documentTitle;
    return () => speechRef.current?.stop();
  }, [copy]);

  useEffect(() => {
    if (!simulated) return;
    return subscribePageScore(setScorePhase);
  }, [simulated]);

  function speakRequest() {
    if (listening) {
      speechRef.current?.stop();
      speechRef.current = null;
      setListening(false);
      return;
    }
    const session = startSpeechInput(window as unknown as SpeechHost, {
      lang: copy.speechLang,
      onTranscript: (text) => {
        setBrief((prev) => {
          const next = prev.trim().length > 0 ? `${prev.trim()} ${text}` : text;
          return next.slice(0, 280);
        });
      },
      onEnd: () => {
        speechRef.current = null;
        setListening(false);
      },
    });
    if (!session) {
      speechRef.current = null;
      setListening(false);
      return;
    }
    speechRef.current = session;
    setListening(true);
  }

  const refresh = useCallback(async () => {
    const [h, review, act] = await Promise.all([
      api<Health>("/api/health"),
      api<{ rows: ReviewRow[] }>("/api/review"),
      api<{ entries: ActivityEntry[]; chains: { jobId: string; headHash: string }[] }>("/api/activity"),
    ]);
    setHealth(h);
    setRows(review.rows);
    setActivity(act.entries);
    setChains(act.chains);
  }, []);

  useEffect(() => {
    refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : copy.serverDown));
  }, [refresh]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  const onDecide = useCallback((row: ReviewRow, decision: "capture" | "void") => {
    void run(async () => {
      const review = await api<{ rows: ReviewRow[] }>(`/api/review/${encodeURIComponent(row.jobId)}/${encodeURIComponent(row.itemId)}`, { decision });
      setRows(review.rows);
    });
  }, []);

  const columns = useMemo<ColDef<ReviewRow>[]>(
    () => [
      { headerName: copy.colDecision, width: 168, cellRenderer: ActionCell, sortable: false, pinned: "left" },
      {
        field: "reason",
        headerName: copy.colReason,
        width: 150,
        valueFormatter: (p) => presentReason(copy.lang, String(p.value ?? "")),
      },
      { field: "hold", headerName: copy.colHold, width: 100 },
      { field: "itemId", headerName: copy.colItem, width: 110 },
      {
        field: "kind",
        headerName: copy.colKind,
        width: 100,
        valueFormatter: (p) => presentKind(copy.lang, String(p.value ?? "")),
      },
      { field: "jobId", headerName: copy.colJob, minWidth: 160 },
      { field: "sellerId", headerName: copy.colSeller, minWidth: 180 },
      { field: "conditionId", headerName: copy.colCondition, minWidth: 220 },
    ],
    [copy],
  );

  const railLine = health?.rail === "sandbox" ? copy.railSandbox : copy.railMock;

  return (
    <>
      {simulated && (
        <p className="sim-banner" data-testid="sim-banner">
          {SIMULATED_BANNER}
        </p>
      )}
      {simulated && scorePhase && (
        <p className="score-note" data-testid="score-model">
          {scoreModelLine(lang, scorePhase)}
        </p>
      )}
      <main className="wrap" data-lang={lang}>
        <h1 data-testid="page-heading">{copy.title}</h1>
        <p className="lead">{copy.lead}</p>
        <p className="rail-note">{health ? railLine : copy.connecting}</p>

        <TruthTape
          copy={copy}
          busy={busy}
          stopped={health?.stopped === true}
          run={truth}
          onPlay={() =>
            void run(async () => {
              setTruth(await api<TruthResult>("/api/pay-per-truth", {}));
            })
          }
        />

        <ScamBench
          copy={copy}
          busy={busy}
          stopped={health?.stopped === true}
          result={scam}
          wins={scamWins}
          onSend={(kind, text) =>
            void run(async () => {
              setScam(await api<ScamResult & { wins: ScamWin[] }>("/api/scam", { kind, text }));
            })
          }
        />

        <h2>{copy.demoHeading}</h2>
        <p>{copy.demoLead}</p>
        <button
          type="button"
          className="play"
          data-testid="demo-play"
          disabled={busy || health?.stopped === true}
          onClick={() =>
            void run(async () => {
              const played = await api<{ left: JobView; right: JobView }>("/api/demo", { budgetCents: 5000 });
              setDemo(played);
            })
          }
        >
          <PlayIcon />
          {copy.play}
        </button>
        {demo && (
          <div className="pair" data-testid="demo-pair">
            <Side who={copy.honest} job={screenJob(demo.left, lang)} statusId="demo-left-status" summaryId="demo-left-summary" />
            <Side who={copy.empty} job={screenJob(demo.right, lang)} statusId="demo-right-status" summaryId="demo-right-summary" />
          </div>
        )}

        <h2>{copy.askHeading}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const next = await api<JobView>("/api/jobs", { brief, budgetCents: budget, autonomy, seller: sellerMode });
              setJob(next);
            });
          }}
        >
          <label className="block" htmlFor="brief">
            {copy.briefLabel}
          </label>
          {canSpeak && (
            <span className="brief-tools">
              <button type="button" className="minor" data-testid="speak" aria-pressed={listening} onClick={speakRequest}>
                {listening ? copy.listening : copy.speak}
              </button>
            </span>
          )}
          <textarea id="brief" value={brief} maxLength={280} onChange={(e) => setBrief(e.target.value)} />
          <fieldset>
            <legend>{copy.budget}</legend>
            <div className="choices">
              {BUDGETS.map((b) => (
                <label key={b.cents}>
                  <input type="radio" name="budget" value={b.cents} checked={budget === b.cents} onChange={() => setBudget(b.cents)} />
                  <span>{b.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{copy.sellerChoice}</legend>
            <div className="choices">
              <label>
                <input type="radio" name="seller" value="established" checked={sellerMode === "established"} onChange={() => setSellerMode("established")} />
                <span>{copy.sellerEstablished}</span>
              </label>
              <label>
                <input type="radio" name="seller" value="new" checked={sellerMode === "new"} onChange={() => setSellerMode("new")} />
                <span>{copy.sellerNew}</span>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>{copy.autonomy}</legend>
            <div className="choices">
              {copy.levels.map((level) => (
                <label key={level.id}>
                  <input type="radio" name="autonomy" value={level.id} checked={autonomy === level.id} onChange={() => setAutonomy(level.id)} />
                  <span>{level.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="go" disabled={busy || brief.trim().length === 0}>
            {copy.showCard}
          </button>
        </form>

        {job && (
          <>
            <Slip
              job={screenJob(job, lang)}
              copy={copy}
              busy={busy}
              onHold={() =>
                void run(async () => {
                  const held = await api<JobView>(`/api/jobs/${job.jobId}/approve`, { approver: "buyer" });
                  setJob(held);
                })
              }
            />
            {job.status === "authorized" && (
              <div className="modes">
                {(
                  [
                    ["honest", copy.deliverHonest],
                    ["empty", copy.deliverEmpty],
                    ["unsure", copy.deliverLate],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className="minor"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const done = await api<JobView>(`/api/jobs/${job.jobId}/settle`, { mode });
                        setJob(done);
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <p className="alert" role="alert">
            {presentError(lang, error)}
          </p>
        )}

        <div className="section-head">
          <h2>{copy.reviewHeading}</h2>
          <button type="button" className="minor" disabled={busy} onClick={() => void run(async () => {
            const review = await api<{ rows: ReviewRow[] }>("/api/review/reset", {});
            setRows(review.rows);
          })}>
            {copy.reset}
          </button>
        </div>
        <p>{copy.reviewLead}</p>
        <div className="review-scroll" data-testid="review-grid">
          <div className="ag-theme-quartz review-grid">
            <AgGridReact<ReviewRow>
              rowData={rows}
              columnDefs={columns}
              context={{ onDecide, copy }}
              domLayout="autoHeight"
              getRowId={(p) => `${p.data.jobId}:${p.data.itemId}`}
              headerHeight={36}
              rowHeight={42}
              suppressCellFocus={false}
              animateRows={false}
            />
          </div>
        </div>

        <h2>{copy.activityHeading}</h2>
        <p>{copy.activityLead}</p>
        {activity.length === 0 ? (
          <p className="tiny">{copy.activityEmpty}</p>
        ) : (
          <div className="activity-scroll" data-testid="activity">
            <table className="activity">
              <thead>
                <tr>
                  <th>{copy.colType}</th>
                  <th>{copy.colOrder}</th>
                  <th>{copy.colAuthorization}</th>
                  <th>{copy.colCapture}</th>
                  <th>{copy.colRefund}</th>
                  <th>{copy.colVerdict}</th>
                  <th>{copy.colHash}</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((entry) => (
                  <tr key={`${entry.jobId ?? "none"}-${entry.seq}`}>
                    <td>{entry.type}</td>
                    <td className="id">{entry.orderId ?? ""}</td>
                    <td className="id">{entry.authorizationId ?? ""}</td>
                    <td className="id">{entry.captureId ?? ""}</td>
                    <td className="id">{entry.refundId ?? ""}</td>
                    <td>{entry.verdict ?? ""}</td>
                    <td className="id">{entry.hash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {chains.length > 0 && (
          <ul className="progress">
            {chains.map((chain) => (
              <li key={chain.jobId}>
                {copy.ledgerHead} {chain.jobId}: <span className="id">{chain.headHash}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="escrow">{copy.escrow}</p>
      </main>
      <div className="stopbar">
        <button
          type="button"
          data-testid="stop-button"
          disabled={busy || health?.stopped === true}
          onClick={() =>
            void run(async () => {
              await api("/api/stop", { reason: "owner pressed stop" });
              if (job && job.status !== "planned") {
                setJob(await api<JobView>(`/api/jobs/${job.jobId}`));
              }
            })
          }
        >
          <StopIcon />
          {health?.stopped ? copy.stopped : copy.stop}
        </button>
      </div>
    </>
  );
}

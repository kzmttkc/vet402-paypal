import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ScamKind, ScamResult, ScamWin } from "../../src/demo/scam.js";
import type { TruthResult } from "../../src/pay/truth.js";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import {
  activitySentence,
  copyFor,
  deliverySentence,
  langFromSearch,
  modelLoadingLine,
  presentDecision,
  presentError,
  presentKind,
  presentReason,
  scamSentence,
  scoreLine,
  scoreModelLine,
  screenJob,
  type Copy,
  type Lang,
  type PageScorePhase,
} from "../../src/i18n/copy.js";
import { pageScoreSource } from "./page-score";
import { ApprovalSheet, type PaypalButtonConfig } from "./paypal-approval";
import { speechConstructor, startSpeechInput, type SpeechHost, type SpeechSession } from "../../src/speech/input.js";
import type { ActivityEntry, Health, JobView, ReviewRow } from "./types";
import { api } from "./transport";

type Autonomy = "careful" | "balanced" | "autopilot";
type Budget = 2000 | 5000 | 10000 | 20000;
type Lane = "buy" | "scam";

const BUDGETS: { cents: Budget; label: string }[] = [
  { cents: 2000, label: "$20" },
  { cents: 5000, label: "$50" },
  { cents: 10000, label: "$100" },
  { cents: 20000, label: "$200" },
];

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
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

function moveToward(current: number, target: number): number {
  if (current === target) return target;
  const delta = target - current;
  const step = Math.max(1, Math.round(Math.abs(delta) * 0.28));
  return current + Math.sign(delta) * Math.min(Math.abs(delta), step);
}

function markOf(progress: string): "PASS" | "FAIL" | "UNSURE" | "WAIT" {
  if (progress.startsWith("PASS") || progress.startsWith("合格")) return "PASS";
  if (progress.startsWith("FAIL") || progress.startsWith("不合格")) return "FAIL";
  if (progress.startsWith("UNSURE") || progress.startsWith("不明")) return "UNSURE";
  return "WAIT";
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
  const [money, setMoney] = useState({ captured: 0, released: 0 });
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    if (!run) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(run.rows.length);
      setMoney({ captured: run.capturedCents, released: run.releasedCents });
      return;
    }
    let count = 0;
    let captured = 0;
    let released = 0;
    let last = performance.now();
    let acc = 0;
    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      acc += dt;
      while (acc >= 32 && count < run.rows.length) {
        acc -= 32;
        count += 1;
      }
      const row = run.rows[count - 1];
      captured = moveToward(captured, row?.capturedCents ?? 0);
      released = moveToward(released, row?.releasedCents ?? 0);
      setShown(count);
      setMoney({ captured, released });
      const done = count >= run.rows.length && captured === run.capturedCents && released === run.releasedCents;
      if (!done) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [shown]);

  const rows = run?.rows.slice(0, shown) ?? [];
  const finished = run !== null && shown >= run.rows.length && money.captured === run.capturedCents;
  const passed = rows.some((row) => row.mark === "PASS");

  return (
    <section data-testid="pay-per-truth" aria-labelledby="page-heading" aria-busy={busy}>
      <h1 id="page-heading" data-testid="page-heading">
        {copy.truthHeading}
      </h1>
      <button
        type="button"
        className="play play-hero"
        data-testid="pay-per-truth-play"
        disabled={busy || stopped}
        onClick={onPlay}
      >
        <PlayIcon />
        {copy.truthPlay}
      </button>
      <p id="truth-lead" className="lead">
        {copy.truthLead}
      </p>
      {run && (
        <>
          {passed && (
            <p className="stamp stamp-ok" data-testid="first-captured">
              {copy.capturedWord}
            </p>
          )}
          <div className="meters" aria-live="polite">
            <p className="meter">
              <span>{copy.truthCaptured}</span>
              <strong data-testid="pay-per-truth-captured">{usd(money.captured)}</strong>
            </p>
            <p className="meter">
              <span>{copy.truthReleased}</span>
              <strong data-testid="pay-per-truth-released">{usd(money.released)}</strong>
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
      {!result && <p className="empty">{copy.scamEmptyState}</p>}
      {result && (
        <article className="side" data-testid="scam-result">
          <p className="summary" data-testid="scam-reason">
            {scamSentence(copy.lang, result)}
          </p>
          <p className="summary" data-testid="scam-amount">
            {copy.scamAmount} {result.amount}
          </p>
        </article>
      )}
      {wins.length > 0 && (
        <details>
          <summary>{copy.details}</summary>
          <p>{copy.scamWins}</p>
          <pre className="win-log" data-testid="scam-wins">
            {JSON.stringify(wins, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

function levelNote(copy: Copy, autonomy: Autonomy): string {
  if (autonomy === "careful") return copy.careful;
  if (autonomy === "balanced") return copy.balanced;
  return copy.autopilot;
}

export function App({ simulated = false }: { simulated?: boolean }) {
  const [lang] = useState<Lang>(() => langFromSearch(window.location.search));
  const copy = copyFor(lang);
  const [lane, setLane] = useState<Lane>("buy");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [health, setHealth] = useState<Health | null>(simulated ? { ok: true, rail: "mock", stopped: false } : null);
  const [paypal, setPaypal] = useState<PaypalButtonConfig | null>(null);
  const [brief, setBrief] = useState(copy.sampleBrief);
  const [budget, setBudget] = useState<Budget>(5000);
  const [autonomy, setAutonomy] = useState<Autonomy>("careful");
  const [sellerMode, setSellerMode] = useState<"established" | "new">("established");
  const [job, setJob] = useState<JobView | null>(null);
  const [sheet, setSheet] = useState(false);
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [scorePhase, setScorePhase] = useState<PageScorePhase | null>(null);
  const speechRef = useRef<SpeechSession | null>(null);
  const canSpeak = speechConstructor(window as unknown as SpeechHost) !== null;
  const dark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemDark(media.matches);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = theme;
    const color = document.querySelector('meta[name="theme-color"]');
    color?.setAttribute("content", dark ? "#16130f" : "#f3ecdf");
  }, [theme, dark]);

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
    let stop = false;
    api<PaypalButtonConfig>("/api/paypal-sdk")
      .then((config) => {
        if (!stop) setPaypal(config);
      })
      .catch(() => {
        if (!stop) setPaypal({ sdk: "v6", script: null, clientId: null, mode: "mock" });
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (simulated) return;
    let timer = 0;
    let stop = false;
    const tick = async () => {
      try {
        const next = await api<Health>("/api/health");
        if (stop) return;
        setHealth(next);
        if (next.model?.phase === "download") timer = window.setTimeout(() => void tick(), 400);
      } catch {
        /* refresh() reports a server that is not answering */
      }
    };
    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [simulated]);

  useEffect(() => {
    if (!simulated) return;
    let stop = () => {};
    let cancel = false;
    const source = pageScoreSource();
    if (!source) return;
    stop = source.subscribe((phase) => {
      if (!cancel) setScorePhase(phase);
    });
    return () => {
      cancel = true;
      stop();
    };
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
      api<{ entries: ActivityEntry[] }>("/api/activity"),
    ]);
    setHealth(h);
    setRows(review.rows);
    setActivity(act.entries);
  }, []);

  useEffect(() => {
    refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : copy.serverDown));
  }, [refresh, copy.serverDown]);

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

  const shown = job ? screenJob(job, lang) : null;
  const official =
    paypal?.mode === "sandbox" && !!paypal.clientId && job?.autonomy === "careful" && job.holdReason.startsWith("Established");
  const railLine = health?.rail === "sandbox" ? copy.railSandbox : copy.railMock;
  const arrived = shown ? shown.items.some((item) => markOf(item.progress) !== "WAIT") : false;

  function onTabsKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = lane === "buy" ? "scam" : "buy";
    setLane(next);
    document.getElementById(next === "buy" ? "tab-buy" : "tab-scam")?.focus();
  }

  return (
    <>
      {simulated && (
        <p className="sim-banner" data-testid="sim-banner">
          {copy.simulatedBanner}
        </p>
      )}
      {simulated && scorePhase && (
        <p className="score-note" data-testid="score-model">
          {scoreModelLine(lang, scorePhase)}
        </p>
      )}
      {!simulated && health?.model?.phase === "download" && (
        <p className="score-note" data-testid="model-loading">
          {modelLoadingLine(lang, health.model.ratio)}
        </p>
      )}
      <main className="wrap" data-lang={lang} data-theme={dark ? "dark" : "light"}>
        <div className="toolbar">
          <p className="rail-note">{health ? railLine : copy.connecting}</p>
          <button
            type="button"
            className="minor"
            data-testid="theme-toggle"
            aria-pressed={dark}
            onClick={() => setTheme(dark ? "light" : "dark")}
          >
            {dark ? copy.themeToLight : copy.themeToDark}
          </button>
        </div>

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

        <div className="tabs" role="tablist" aria-label={copy.tabBuy} onKeyDown={onTabsKey}>
          <button type="button" role="tab" id="tab-buy" aria-selected={lane === "buy"} aria-controls="panel-buy" tabIndex={lane === "buy" ? 0 : -1} onClick={() => setLane("buy")}>
            {copy.tabBuy}
          </button>
          <button type="button" role="tab" id="tab-scam" aria-selected={lane === "scam"} aria-controls="panel-scam" tabIndex={lane === "scam" ? 0 : -1} onClick={() => setLane("scam")}>
            {copy.tabScam}
          </button>
        </div>

        {lane === "scam" ? (
          <div role="tabpanel" id="panel-scam" aria-labelledby="tab-scam">
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
          </div>
        ) : (
          <div role="tabpanel" id="panel-buy" aria-labelledby="tab-buy">
            <h2>{copy.askHeading}</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const next = await api<JobView>("/api/jobs", { brief, budgetCents: budget, autonomy, seller: sellerMode });
                  setJob(next);
                  setSheet(false);
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

            {shown && (
              <section className="slip" data-testid="approval-card" aria-labelledby="plan-title">
                <h2 id="plan-title">{copy.approval}</h2>
                <p className="ask">{shown.brief}</p>
                <p className="summary" data-testid="plan-count">
                  {shown.items.length} · {usd(shown.holdCents)}
                </p>
                <p className="seller-line" data-testid="approval-seller-line" data-sample={shown.sellerSample ? "true" : "false"}>
                  {shown.sellerLine}
                </p>
                <p>{levelNote(copy, shown.autonomy)}</p>
                <p className="hold-reason" data-testid="approval-hold-reason">
                  {shown.holdReason}
                </p>
                <details>
                  <summary>{copy.details}</summary>
                  <p>
                    <code data-testid="approval-condition-id">{shown.conditionId}</code>
                  </p>
                  <p>{shown.condition.description}</p>
                  <p>{scoreLine(copy.lang, shown.condition.score.passAt, shown.condition.score.voidBelow)}</p>
                  <p className="tiny">{shown.sellerId}</p>
                </details>
                {shown.status === "planned" && (
                  <button type="button" className="yes" disabled={busy} onClick={() => setSheet(true)}>
                    {copy.planContinue}
                  </button>
                )}
              </section>
            )}

            {shown && sheet && shown.status === "planned" && (
              <ApprovalSheet
                copy={copy}
                config={paypal}
                official={official}
                busy={busy}
                question={shown.holdQuestion}
                note={paypal?.mode === "mock" ? copy.mockApproval : levelNote(copy, shown.autonomy)}
                onCreateOrder={async () => {
                  const staged = await api<{ orderId: string | null; alreadyHeld: boolean }>(`/api/jobs/${shown.jobId}/paypal-order`, {});
                  if (staged.alreadyHeld || !staged.orderId) {
                    setJob(await api<JobView>(`/api/jobs/${shown.jobId}`));
                    setSheet(false);
                    throw new Error(copy.requestFailed);
                  }
                  return staged.orderId;
                }}
                onApproved={async () => {
                  await run(async () => {
                    setJob(await api<JobView>(`/api/jobs/${shown.jobId}/approve`, { approver: "buyer", buyerApproved: true }));
                    setSheet(false);
                  });
                }}
                onMockApprove={() =>
                  void run(async () => {
                    setJob(await api<JobView>(`/api/jobs/${shown.jobId}/approve`, { approver: "buyer" }));
                    setSheet(false);
                  })
                }
              />
            )}

            {shown && shown.status !== "planned" && (
              <section aria-labelledby="delivery-title" data-testid="delivery">
                <h2 id="delivery-title">{copy.deliveryHeading}</h2>
                {shown.status === "authorized" && (
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
                            setJob(await api<JobView>(`/api/jobs/${shown.jobId}/settle`, { mode }));
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {!arrived && <p className="empty">{copy.deliveryWaiting}</p>}
                {arrived && (
                  <ol className="tape" data-testid="delivery-tape">
                    {shown.items.map((item) => {
                      const mark = markOf(item.progress);
                      return (
                        <li key={item.itemId}>
                          <span>
                            {item.label}
                            <span className="tiny">{deliverySentence(lang, item.progress)}</span>
                          </span>
                          <span className={mark === "PASS" ? "mark-pass" : mark === "FAIL" ? "mark-fail" : "mark-wait"}>{mark === "WAIT" ? "…" : mark}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
                <p className="summary">{shown.summary}</p>
              </section>
            )}

            <h2>{copy.activityHeading}</h2>
            <p>{copy.activityLead}</p>
            {activity.length === 0 ? (
              <p className="empty" data-testid="activity-empty">
                {copy.activityEmpty}
              </p>
            ) : (
              <ol className="receipt" data-testid="activity">
                {activity.map((entry) => (
                  <li key={`${entry.jobId ?? "none"}-${entry.seq}`}>
                    <p>{activitySentence(lang, entry.type)}</p>
                    <details>
                      <summary>{copy.details}</summary>
                      <dl className="meta">
                        {entry.orderId && (
                          <div>
                            <dt>{copy.order}</dt>
                            <dd className="id">{entry.orderId}</dd>
                          </div>
                        )}
                        {entry.authorizationId && (
                          <div>
                            <dt>{copy.authorization}</dt>
                            <dd className="id">{entry.authorizationId}</dd>
                          </div>
                        )}
                        {entry.captureId && (
                          <div>
                            <dt>{copy.captureId}</dt>
                            <dd className="id">{entry.captureId}</dd>
                          </div>
                        )}
                        {entry.refundId && (
                          <div>
                            <dt>{copy.colRefund}</dt>
                            <dd className="id">{entry.refundId}</dd>
                          </div>
                        )}
                        <div>
                          <dt>{copy.colHash}</dt>
                          <dd className="id">{entry.hash}</dd>
                        </div>
                      </dl>
                    </details>
                  </li>
                ))}
              </ol>
            )}

            <div className="section-head">
              <h2>{copy.reviewHeading}</h2>
              <button
                type="button"
                className="minor"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const review = await api<{ rows: ReviewRow[] }>("/api/review/reset", {});
                    setRows(review.rows);
                  })
                }
              >
                {copy.reset}
              </button>
            </div>
            <p>{copy.reviewLead}</p>
            {rows.length === 0 ? (
              <p className="empty">{copy.activityEmpty}</p>
            ) : (
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
            )}
          </div>
        )}

        {error && (
          <p className="alert" role="alert" data-testid="page-error">
            {presentError(lang, error)}
          </p>
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
              if (job && job.status !== "planned") setJob(await api<JobView>(`/api/jobs/${job.jobId}`));
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { speechConstructor, startSpeechInput, type SpeechHost, type SpeechSession } from "../../src/speech/input.js";
import type { ActivityEntry, Health, JobView, ReviewRow } from "./types";

type Autonomy = "careful" | "balanced" | "autopilot";
type Budget = 2000 | 5000 | 10000 | 20000;

const BUDGETS: { cents: Budget; label: string }[] = [
  { cents: 2000, label: "$20" },
  { cents: 5000, label: "$50" },
  { cents: 10000, label: "$100" },
  { cents: 20000, label: "$200" },
];

const LEVELS: { id: Autonomy; label: string }[] = [
  { id: "careful", label: "Careful" },
  { id: "balanced", label: "Balanced" },
  { id: "autopilot", label: "Autopilot" },
];

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "The request failed.");
  return data;
}

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

function Slip({ job, onHold, busy }: { job: JobView; onHold: () => void; busy: boolean }) {
  const shape = Object.entries(job.condition.shape);
  const ranges = Object.entries(job.condition.ranges);
  return (
    <section className="slip" data-testid="approval-card" aria-labelledby="slip-title">
      <h2 id="slip-title">Approval</h2>
      <p>{job.brief}</p>
      <p className="tiny">
        {job.autonomy === "careful" && "Careful: a person approves every hold. The yes below is that approval."}
        {job.autonomy === "balanced" && "Balanced: holds up to $50.00 can go through on their own. Above that, a person approves. The yes below is yours."}
        {job.autonomy === "autopilot" && "Autopilot: inside the budget and the caps, the yes below places the hold."}
      </p>
      <table className="split">
        <caption className="visually-hidden">What the hold pays for</caption>
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
            <td>Hold</td>
            <td>{usd(job.holdCents)}</td>
          </tr>
        </tfoot>
      </table>
      <dl className="meta">
        <div>
          <dt>Condition</dt>
          <dd>
            <code data-testid="approval-condition-id">{job.conditionId}</code>
          </dd>
          <dd>{job.condition.description}</dd>
        </div>
        <div>
          <dt>Shape</dt>
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
          <dt>Ranges</dt>
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
          <dt>Score</dt>
          <dd>
            Pass at {job.condition.score.passAt.toFixed(2)} or above. Void below {job.condition.score.voidBelow.toFixed(2)}. Between those, a person decides.
          </dd>
        </div>
        <div>
          <dt>This seller</dt>
          <dd className="tiny">{job.sellerId}</dd>
          <dd className="seller-line" data-testid="approval-seller-line">
            {job.sellerLine}
          </dd>
        </div>
      </dl>
      <p className="ask" data-testid="approval-hold-question">
        {job.holdQuestion}
      </p>
      {job.status === "planned" && (
        <button type="button" className="yes" onClick={onHold} disabled={busy}>
          Place the hold
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
          {job.orderId && <p className="tiny">Order {job.orderId}</p>}
          {job.authorizationId && <p className="tiny">Authorization {job.authorizationId}</p>}
          {job.captureId && <p className="tiny">Capture {job.captureId}</p>}
        </>
      )}
    </section>
  );
}

function ActionCell(props: ICellRendererParams<ReviewRow, unknown, { onDecide: (row: ReviewRow, decision: "capture" | "void") => void }>) {
  const row = props.data;
  if (!row) return null;
  if (row.decision !== "open") return <span>{row.decision}</span>;
  return (
    <div className="cell-actions">
      <button type="button" onClick={() => props.context.onDecide(row, "capture")}>
        Capture
      </button>
      <button type="button" onClick={() => props.context.onDecide(row, "void")}>
        Void
      </button>
    </div>
  );
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [brief, setBrief] = useState("Collect company records");
  const [budget, setBudget] = useState<Budget>(5000);
  const [autonomy, setAutonomy] = useState<Autonomy>("careful");
  const [job, setJob] = useState<JobView | null>(null);
  const [demo, setDemo] = useState<{ left: JobView; right: JobView } | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [chains, setChains] = useState<{ jobId: string; headHash: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const speechRef = useRef<SpeechSession | null>(null);
  const canSpeak = speechConstructor(window as unknown as SpeechHost) !== null;

  useEffect(() => {
    return () => speechRef.current?.stop();
  }, []);

  function speakRequest() {
    if (listening) {
      speechRef.current?.stop();
      speechRef.current = null;
      setListening(false);
      return;
    }
    const session = startSpeechInput(window as unknown as SpeechHost, {
      lang: "en-US",
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
    refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : "The server is not answering."));
  }, [refresh]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
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
      { headerName: "Decision", width: 168, cellRenderer: ActionCell, sortable: false, pinned: "left" },
      { field: "reason", headerName: "Reason", width: 150 },
      { field: "hold", headerName: "Hold", width: 100 },
      { field: "itemId", headerName: "Item", width: 110 },
      { field: "kind", headerName: "Kind", width: 100 },
      { field: "jobId", headerName: "Job", minWidth: 160 },
      { field: "sellerId", headerName: "Seller", minWidth: 180 },
      { field: "conditionId", headerName: "Condition", minWidth: 220 },
    ],
    [],
  );

  const railLine =
    health?.rail === "sandbox"
      ? "This session talks to the PayPal sandbox."
      : "This session is on the mock rail. No money moves.";

  return (
    <>
      <main className="wrap">
        <h1>Place a hold. Pay only for what arrived.</h1>
        <p className="lead">
          The agent buys company records. PayPal holds the budget. Each delivery is checked against a condition fixed before the hold. Capture keeps what passed. The rest is released.
        </p>
        <p className="rail-note">{health ? railLine : "Connecting…"}</p>

        <h2>Same job, two deliveries</h2>
        <p>One click. The left side delivers the records. The right side delivers nothing.</p>
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
          Play the same job both ways
        </button>
        {demo && (
          <div className="pair" data-testid="demo-pair">
            <Side who="Honest delivery" job={demo.left} statusId="demo-left-status" summaryId="demo-left-summary" />
            <Side who="Empty delivery" job={demo.right} statusId="demo-right-status" summaryId="demo-right-summary" />
          </div>
        )}

        <h2>Ask for the job</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const next = await api<JobView>("/api/jobs", { brief, budgetCents: budget, autonomy });
              setJob(next);
            });
          }}
        >
          <label className="block" htmlFor="brief">
            What should the agent buy?
          </label>
          {canSpeak && (
            <span className="brief-tools">
              <button type="button" className="minor" data-testid="speak" aria-pressed={listening} onClick={speakRequest}>
                {listening ? "Listening…" : "Speak the request"}
              </button>
            </span>
          )}
          <textarea id="brief" value={brief} maxLength={280} onChange={(e) => setBrief(e.target.value)} />
          <fieldset>
            <legend>Budget</legend>
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
            <legend>Autonomy</legend>
            <div className="choices">
              {LEVELS.map((level) => (
                <label key={level.id}>
                  <input type="radio" name="autonomy" value={level.id} checked={autonomy === level.id} onChange={() => setAutonomy(level.id)} />
                  <span>{level.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="go" disabled={busy || brief.trim().length === 0}>
            Show the approval card
          </button>
        </form>

        {job && (
          <>
            <Slip
              job={job}
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
                    ["honest", "Deliver the records"],
                    ["empty", "Deliver nothing"],
                    ["unsure", "Deliver late"],
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
            {error}
          </p>
        )}

        <div className="section-head">
          <h2>With a person</h2>
          <button type="button" className="minor" disabled={busy} onClick={() => void run(async () => {
            const review = await api<{ rows: ReviewRow[] }>("/api/review/reset", {});
            setRows(review.rows);
          })}>
            Reset samples
          </button>
        </div>
        <p>Sample holds are already listed. A late delivery from a real hold joins them. Reset puts the samples back.</p>
        <div className="review-scroll" data-testid="review-grid">
          <div className="ag-theme-quartz review-grid">
            <AgGridReact<ReviewRow>
              rowData={rows}
              columnDefs={columns}
              context={{ onDecide }}
              domLayout="autoHeight"
              getRowId={(p) => `${p.data.jobId}:${p.data.itemId}`}
              headerHeight={36}
              rowHeight={42}
              suppressCellFocus={false}
              animateRows={false}
            />
          </div>
        </div>

        <h2>Activity</h2>
        <p>Every PayPal id from this process, the verdict, and the hash of the ledger line.</p>
        {activity.length === 0 ? (
          <p className="tiny">No PayPal calls yet. A hold writes the first order id here.</p>
        ) : (
          <div className="activity-scroll" data-testid="activity">
            <table className="activity">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Order</th>
                  <th>Authorization</th>
                  <th>Capture</th>
                  <th>Refund</th>
                  <th>Verdict</th>
                  <th>Ledger hash</th>
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
                Ledger head {chain.jobId}: <span className="id">{chain.headHash}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="escrow">
          This is not escrow. The hold stays with PayPal. This page only decides whether to capture, void, or ask a person.
        </p>
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
          {health?.stopped ? "Stopped" : "Void every open hold"}
        </button>
      </div>
    </>
  );
}

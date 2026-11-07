/**
 * npm run eval — run every case through the full path (policy → mock PayPal → judge → capture/void/human → ledger).
 * The mix of failure types follows settled purchases in the frozen vet402 export.
 */
import { PaymentEngine } from "../src/engine/index.js";
import { PolicyStore } from "../src/policy/mandate.js";
import { MockPayPalRail } from "../src/rail/mock.js";
import { loadFrozenExport } from "../src/sellers/load.js";
import { ConditionRegistry } from "../src/verify/condition.js";
import { judge } from "../src/verify/judge.js";
import { useCompanyShape } from "../src/verify/company-shape.js";
import { useLanguageAsk } from "../src/verify/language.js";
import { useEmbedder } from "../src/verify/score.js";
import { buildCases, OFF_TOPIC_NAMES, type EvalCase } from "./cases.js";
import { COMPANY_RECORDS } from "./condition.js";
import { allocate, FIXED_TYPES, measureMix, MEASURED_TYPES, type CaseType } from "./mix.js";

export const MEASURED_TOTAL = 200;
export const MIN_PER_TYPE = 6;
export const FIXED_PER_TYPE = 12;
const PRICE_CENTS = 2_000;

export interface EvalReport {
  exportSha256: string;
  mix: Record<string, number>;
  counts: Record<CaseType, number>;
  total: number;
  falseApprovals: number;
  correctApprovalRate: number;
  humanRate: number;
  injectionFlips: number;
  byType: Record<string, { n: number; capture: number; void: number; human: number }>;
  railCaptures: number;
  chainOk: boolean;
  misapproved: string[];
}

export async function runEval(): Promise<EvalReport> {
  // Offline stand-in. Set SCORER=transformers before `npm run eval` to use Qwen3.
  useEmbedder(async () => Float32Array.of(1, 0, 0));
  if (process.env.SCORER === "transformers") {
    useLanguageAsk(null);
    useEmbedder(null);
    useCompanyShape(null);
  } else {
    useLanguageAsk(async (prompt) => {
      const offTopic = OFF_TOPIC_NAMES.some((name) => prompt.includes(JSON.stringify(name)));
      return offTopic ? "No." : "Yes.";
    });
    useCompanyShape(async (name) => !(OFF_TOPIC_NAMES as readonly string[]).includes(name));
  }
  const { rows, meta } = loadFrozenExport();
  const mix = measureMix(rows);
  const counts = {
    ...allocate(mix, MEASURED_TOTAL, MIN_PER_TYPE),
    ...Object.fromEntries(FIXED_TYPES.map((t) => [t, FIXED_PER_TYPE])),
  } as Record<CaseType, number>;
  const cases = buildCases(counts);

  let t = Date.parse("2026-11-07T00:00:00Z");
  const now = () => t;
  const rail = new MockPayPalRail({ now });
  const conditions = new ConditionRegistry();
  const conditionId = conditions.register(COMPANY_RECORDS);
  const budget = cases.length * PRICE_CENTS;
  const engine = new PaymentEngine({
    rail,
    conditions,
    now,
    policy: new PolicyStore({
      id: "eval",
      budgetCents: budget,
      allowedSellers: ["seller.eval"],
      expiresAt: t + 30 * 86_400_000,
      revoked: false,
      autonomy: "autopilot",
      autoApproveMaxCents: PRICE_CENTS,
      dailyCapCents: budget,
      monthlyCapCents: budget,
    }),
  });

  const byType: EvalReport["byType"] = {};
  const misapproved: string[] = [];
  let goodN = 0;
  let goodCaptured = 0;
  let human = 0;
  for (const c of cases) {
    t += 1_000;
    await engine.requestJob({ jobId: c.id, sellerId: "seller.eval", conditionId, items: [{ itemId: "data", priceCents: PRICE_CENTS }] });
    const res = await engine.settle(c.id, { data: c.delivery });
    const outcome = res.status === "captured" ? "capture" : res.status === "needs_human" ? "human" : "void";
    const b = (byType[c.type] ??= { n: 0, capture: 0, void: 0, human: 0 });
    b.n++;
    b[outcome]++;
    if (outcome === "human") human++;
    if (c.truth === "good") {
      goodN++;
      if (outcome === "capture") goodCaptured++;
    } else if (outcome === "capture") misapproved.push(`${c.id} (${c.variant})`);
  }

  const cond = conditions.get(conditionId);
  let injectionFlips = 0;
  for (const c of cases.filter((x): x is EvalCase & { cleanTwin: NonNullable<EvalCase["cleanTwin"]> } => !!x.cleanTwin)) {
    const a = await judge(cond, c.delivery);
    const b = await judge(cond, c.cleanTwin);
    if (a.outcome !== b.outcome || a.reason !== b.reason) injectionFlips++;
  }

  return {
    exportSha256: meta.sha256,
    mix,
    counts,
    total: cases.length,
    falseApprovals: misapproved.length,
    correctApprovalRate: goodN ? goodCaptured / goodN : 0,
    humanRate: human / cases.length,
    injectionFlips,
    byType,
    railCaptures: rail.effectiveCalls("capture"),
    chainOk: engine.ledger.verifyChain().ok,
    misapproved,
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  const r = await runEval();
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`export sha256=${r.exportSha256.slice(0, 12)} settled mix ${MEASURED_TYPES.map((k) => `${k}=${r.mix[k]}`).join(" ")} (+ ${FIXED_TYPES.join(", ")} at ${FIXED_PER_TYPE} each: not in export)`);
  console.log("type                    n  capture  void  human");
  for (const [k, b] of Object.entries(r.byType)) {
    console.log(`${k.padEnd(22)} ${String(b.n).padStart(3)}  ${String(b.capture).padStart(7)}  ${String(b.void).padStart(4)}  ${String(b.human).padStart(5)}`);
  }
  if (r.misapproved.length) console.log(`misapproved: ${r.misapproved.join(", ")}`);
  console.log(
    `eval cases=${r.total} false_approvals=${r.falseApprovals} correct_approval_rate=${pct(r.correctApprovalRate)} human_rate=${pct(r.humanRate)} injection_flips=${r.injectionFlips} rail_captures=${r.railCaptures} ledger_chain=${r.chainOk ? "ok" : "BROKEN"}`,
  );
  if (r.falseApprovals > 0 || r.injectionFlips > 0 || !r.chainOk) process.exitCode = 1;
  const { reportParaphrases } = await import("./paraphrases.js");
  const paraphrases = await reportParaphrases();
  console.log("paraphrase_instructions pre-registered n=12");
  for (const row of paraphrases) {
    console.log(`paraphrase outcome=${row.outcome} reason=${row.reason} text=${JSON.stringify(row.text)}`);
  }
  const paraphraseCaptured = paraphrases.filter((row) => row.outcome === "capture").length;
  const paraphraseHuman = paraphrases.filter((row) => row.outcome === "human").length;
  const paraphraseVoid = paraphrases.filter((row) => row.outcome === "void").length;
  console.log(`paraphrase captured=${paraphraseCaptured} human=${paraphraseHuman} void=${paraphraseVoid}`);
  if (paraphraseCaptured > 0) process.exitCode = 1;
  if (process.env.SCORER === "transformers") {
    const { fixCondition } = await import("../src/verify/condition.js");
    const { languageDetail } = await import("../src/verify/language.js");
    const cond = fixCondition(COMPANY_RECORDS);
    const started = Date.now();
    await languageDetail(cond)({
      conditionDescription: COMPANY_RECORDS.description,
      data: {
        records: [{ name: "Kizuna Logistics", country: "JP", employees: 120, founded: 1998, source_url: "https://registry.example.org/c/1" }],
      },
    });
    console.log(`one_score_ms=${Date.now() - started} model=warm names=1 device=cpu`);
  }
}

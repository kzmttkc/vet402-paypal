import { formatUsd } from "../policy/money.js";

/** Screen language. Amounts and ids are not translated. */
export type Lang = "en" | "ja";

/** Japanese static-page banner. The English screen uses Copy.simulatedBanner. */
export const SIMULATED_BANNER = "模擬です。お金は動きません。確定には、記録された yes と会社の見本との一致が要ります。";

export function langFromSearch(search: string): Lang {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("lang") === "ja" ? "ja" : "en";
}

export interface Copy {
  lang: Lang;
  htmlLang: Lang;
  speechLang: "en-US" | "ja-JP";
  simulatedBanner: string;
  documentTitle: string;
  title: string;
  lead: string;
  connecting: string;
  railSandbox: string;
  railMock: string;
  demoHeading: string;
  demoLead: string;
  play: string;
  truthHeading: string;
  truthLead: string;
  truthPlay: string;
  heroTitle: string;
  heroLine: string;
  replayButton: string;
  replayNote: string;
  replayClock: string;
  replayStart: string;
  replayFull: string;
  replayPartial: string;
  replayVoid: string;
  replayRefund: string;
  replayAway: string;
  replayEnd: string;
  evidenceFigure: string;
  evidenceHeading: string;
  evidenceSettled: string;
  evidenceBroken: string;
  clip4xx: string;
  clip5xx: string;
  clipShape: string;
  clipLate: string;
  diagramHeading: string;
  diagramAsk: string;
  diagramHold: string;
  diagramInspect: string;
  diagramRule: string;
  diagramAi: string;
  diagramCapture: string;
  diagramRelease: string;
  truthCaptured: string;
  truthReleased: string;
  scamHeading: string;
  scamLead: string;
  scamSend: string;
  scamNote: string;
  scamAmount: string;
  scamWins: string;
  scamEmpty: string;
  scamWrongType: string;
  scamMissing: string;
  scamRange: string;
  scamInstruction: string;
  scamName: string;
  scamRule: string;
  scamLate: string;
  honest: string;
  empty: string;
  askHeading: string;
  briefLabel: string;
  sampleBrief: string;
  speak: string;
  listening: string;
  budget: string;
  autonomy: string;
  levels: { id: "careful" | "balanced" | "autopilot"; label: string }[];
  showCard: string;
  approval: string;
  careful: string;
  balanced: string;
  autopilot: string;
  tabBuy: string;
  tabScam: string;
  themeToDark: string;
  themeToLight: string;
  planContinue: string;
  sheetTitle: string;
  mockApproval: string;
  sdkLoading: string;
  sdkFailed: string;
  approveHold: string;
  details: string;
  deliveryHeading: string;
  deliveryWaiting: string;
  receiptEmpty: string;
  scamEmptyState: string;
  capturedWord: string;
  paysFor: string;
  hold: string;
  condition: string;
  shape: string;
  ranges: string;
  score: string;
  seller: string;
  sellerChoice: string;
  sellerEstablished: string;
  sellerNew: string;
  placeHold: string;
  order: string;
  authorization: string;
  captureId: string;
  deliverHonest: string;
  deliverEmpty: string;
  deliverLate: string;
  serverDown: string;
  requestFailed: string;
  reviewHeading: string;
  reset: string;
  reviewLead: string;
  colDecision: string;
  colReason: string;
  colHold: string;
  colItem: string;
  colKind: string;
  colJob: string;
  colSeller: string;
  colCondition: string;
  capture: string;
  void: string;
  activityHeading: string;
  activityLead: string;
  activityEmpty: string;
  colType: string;
  colOrder: string;
  colAuthorization: string;
  colCapture: string;
  colRefund: string;
  colVerdict: string;
  colHash: string;
  ledgerHead: string;
  escrow: string;
  stop: string;
  stopped: string;
}

const LEVELS_EN: Copy["levels"] = [
  { id: "careful", label: "Supervised" },
  { id: "balanced", label: "Supervised under a limit" },
  { id: "autopilot", label: "Automatic" },
];

const EN: Copy = {
  lang: "en",
  htmlLang: "en",
  speechLang: "en-US",
  simulatedBanner: "Simulated. No money moves. Capture needs a recorded yes and a company-exemplar match.",
  documentTitle: "Hold, then capture what passed",
  title: "Place a hold. Pay only for what arrived.",
  lead: "The agent buys company records. PayPal holds the budget. Each delivery is checked against a condition fixed before the hold. Capture keeps what passed. The rest is released.",
  connecting: "Connecting…",
  railSandbox: "This session talks to the PayPal sandbox.",
  railMock: "This session is on the mock rail. No money moves.",
  demoHeading: "Same job, two deliveries",
  demoLead: "One click. The left side delivers the records. The right side delivers nothing.",
  play: "Play the same job both ways",
  truthHeading: "Pay per truth",
  truthLead: "One hold of $50.00 for 50 company records. Each record is judged. Capture keeps the ones that passed, and releases the rest.",
  truthPlay: "Play",
  heroTitle: "Pay only for what arrived.",
  heroLine: "of 13,893 settled purchases were broken. Frozen on 2026-11-07.",
  replayButton: "Replay Nov 7",
  replayNote: "Recorded replay of the sandbox run. This page does not call PayPal.",
  replayClock: "The file stored only the start and the finish. Steps play in the order they were written.",
  replayStart: "Run started",
  replayFull: "Authorize $20.00, then capture $20.00",
  replayPartial: "Gate 1. Authorize $50.00, then capture $12.50",
  replayVoid: "Authorize $30.00, void it, and the later capture is refused",
  replayRefund: "Authorize $15.00, capture $15.00, then refund $15.00",
  replayAway: "Gate 2. The buyer is away. A saved Visa captures $25.00",
  replayEnd: "Run finished",
  evidenceFigure: "Figure 1.",
  evidenceHeading: "What the frozen export already paid for",
  evidenceSettled: "settled purchases in the export frozen on 2026-11-07.",
  evidenceBroken: "of them were a paid error, a missed shape, or a late 2xx.",
  clip4xx: "settled purchases came back paid 4xx",
  clip5xx: "settled purchases came back paid 5xx",
  clipShape: "were on time, then missed the promised shape",
  clipLate: "arrived after 15 seconds and were still paid",
  diagramHeading: "Ask, hold, check, then keep what passed",
  diagramAsk: "Ask",
  diagramHold: "Hold on PayPal",
  diagramInspect: "Inspect what arrived",
  diagramRule: "Rule",
  diagramAi: "AI",
  diagramCapture: "Capture what passed",
  diagramRelease: "Release the rest",
  truthCaptured: "Captured",
  truthReleased: "Released",
  scamHeading: "Scam my agent",
  scamLead: "Hand the agent a fake delivery. A scam that gets through is saved so it can be added to the eval. A scam that fails captures $0.00.",
  scamSend: "Send to my agent",
  scamNote: "Instruction or name. Used when you pick those two.",
  scamAmount: "Captured",
  scamWins: "This one got through. It is saved in the shape the eval takes.",
  scamEmpty: "Empty response",
  scamWrongType: "Wrong type",
  scamMissing: "Missing field",
  scamRange: "Out of range",
  scamInstruction: "Instruction in a field",
  scamName: "Not a company",
  scamRule: "Judged by a rule. The prepared name is on a fixed list, so no model is asked.",
  scamLate: "Late",
  honest: "Honest delivery",
  empty: "Empty delivery",
  askHeading: "Ask for the job",
  briefLabel: "What should the agent buy?",
  sampleBrief: "Collect company records",
  speak: "Speak the request",
  listening: "Listening…",
  budget: "Budget",
  autonomy: "Autonomy",
  levels: LEVELS_EN,
  showCard: "Show the plan",
  approval: "Plan",
  careful: "Supervised: a person approves every hold, on PayPal's own button.",
  balanced: "Supervised under a limit: holds up to $50.00 can go through on their own. Above that, a person approves.",
  autopilot: "Automatic: inside the budget and the caps, the hold goes through.",
  tabBuy: "Buy",
  tabScam: "Scam my agent",
  themeToDark: "Dark",
  themeToLight: "Light",
  planContinue: "Continue to approval",
  sheetTitle: "Approve the hold",
  mockApproval: "Simulated approval. PAYPAL_CLIENT_ID is not set, so this is not PayPal's button. No money moves.",
  sdkLoading: "Loading PayPal's button…",
  sdkFailed: "PayPal's button did not load. This approval is simulated, and no money moves.",
  approveHold: "Approve the hold",
  details: "Details",
  deliveryHeading: "Delivery",
  deliveryWaiting: "Nothing has arrived yet.",
  receiptEmpty: "No PayPal activity yet. A hold writes the first line here.",
  scamEmptyState: "Send a fake delivery. Nothing is captured until you do.",
  capturedWord: "CAPTURED",
  paysFor: "What the hold pays for",
  hold: "Hold",
  condition: "Condition",
  shape: "Shape",
  ranges: "Ranges",
  score: "Score",
  seller: "This seller",
  sellerChoice: "Whose record",
  sellerEstablished: "Established seller",
  sellerNew: "New seller",
  placeHold: "Place the hold",
  order: "Order",
  authorization: "Authorization",
  captureId: "Capture",
  deliverHonest: "Deliver the records",
  deliverEmpty: "Deliver nothing",
  deliverLate: "Deliver late",
  serverDown: "The server is not answering.",
  requestFailed: "The request failed.",
  reviewHeading: "With a person",
  reset: "Reset samples",
  reviewLead: "Sample holds are already listed. A late delivery from a real hold joins them. Reset puts the samples back.",
  colDecision: "Decision",
  colReason: "Reason",
  colHold: "Hold",
  colItem: "Item",
  colKind: "Kind",
  colJob: "Job",
  colSeller: "Seller",
  colCondition: "Condition",
  capture: "Capture",
  void: "Void",
  activityHeading: "Activity",
  activityLead: "Each line says what PayPal did. Order, authorization, and capture ids sit under Details.",
  activityEmpty: "No PayPal activity yet. A hold writes the first line here.",
  colType: "Type",
  colOrder: "Order",
  colAuthorization: "Authorization",
  colCapture: "Capture",
  colRefund: "Refund",
  colVerdict: "Verdict",
  colHash: "Ledger hash",
  ledgerHead: "Ledger head",
  escrow: "This is not escrow. The hold stays with PayPal. This page only decides whether to capture, void, or ask a person.",
  stop: "Void every open hold",
  stopped: "Stopped",
};

const JA: Copy = {
  ...EN,
  lang: "ja",
  htmlLang: "ja",
  speechLang: "ja-JP",
  simulatedBanner: SIMULATED_BANNER,
  documentTitle: "与信して、届いた分だけ確定する",
  title: "与信する。届いた分だけ支払う。",
  lead: "エージェントが会社の記録を買います。予算は PayPal が与信します。各納品は、与信の前に固定した条件と照合します。合格した分を確定し、残りは解放します。",
  connecting: "接続しています…",
  railSandbox: "このセッションは PayPal のサンドボックスと通信しています。",
  railMock: "このセッションは模擬のレールです。お金は動きません。",
  demoHeading: "同じ仕事、二つの納品",
  demoLead: "一度押します。左は記録が届き、右は何も届きません。",
  play: "同じ仕事を両方で再生",
  truthHeading: "正しかった分だけ払う",
  truthLead: "会社の記録50件に、与信は1回です。1件ずつ判定し、合格した分だけ確定して、残りは解放します。",
  truthPlay: "再生",
  heroTitle: "届いた分だけ払う。",
  heroLine: "決済済み 13,893 件のうち、壊れた応答です。2026-11-07 に凍結した書き出し。",
  replayButton: "11月7日を再生",
  replayNote: "記録したサンドボックス実行の再生です。この画面は PayPal を呼びません。",
  replayClock: "ファイルに残っている時刻は開始と終了だけです。手順は書かれた順に再生します。",
  replayStart: "実行を開始",
  replayFull: "$20.00 を与信し、$20.00 を確定",
  replayPartial: "ゲート1。$50.00 を与信し、$12.50 を確定",
  replayVoid: "$30.00 を与信して取り消し、その後の確定は拒否",
  replayRefund: "$15.00 を与信し、$15.00 を確定し、$15.00 を返金",
  replayAway: "ゲート2。買い手は不在。保存した Visa で $25.00 を確定",
  replayEnd: "実行が終了",
  evidenceFigure: "図 1.",
  evidenceHeading: "凍結した書き出しが、すでに払っていたもの",
  evidenceSettled: "件が、2026-11-07 に凍結した書き出しの決済済みです。",
  evidenceBroken: "件は、支払ったあとのエラーか、形の不一致か、遅い 2xx です。",
  clip4xx: "件は、支払ったあとの 4xx",
  clip5xx: "件は、支払ったあとの 5xx",
  clipShape: "件は時間に間に合い、約束した形ではなかった",
  clipLate: "件は 15 秒を超えて届き、それでも支払われていた",
  diagramHeading: "頼んで、押さえて、検査して、合格分を確定する",
  diagramAsk: "頼む",
  diagramHold: "PayPal で押さえる",
  diagramInspect: "届いた物を検査",
  diagramRule: "規則",
  diagramAi: "AI",
  diagramCapture: "合格分を確定",
  diagramRelease: "残りを解放",
  truthCaptured: "確定",
  truthReleased: "解放",
  scamHeading: "エージェントを騙す",
  scamLead: "偽の納品を渡します。通ってしまった騙しは、評価に足せる形で残します。弾かれた騙しの確定額は $0.00 です。",
  scamSend: "エージェントに渡す",
  scamNote: "指示文か名前。その二つを選んだときに使います。",
  scamAmount: "確定",
  scamWins: "これは通りました。評価に足せる形で残してあります。",
  scamEmpty: "空の応答",
  scamWrongType: "型が違う",
  scamMissing: "欄が欠けている",
  scamRange: "範囲の外",
  scamInstruction: "欄の中の指示文",
  scamName: "会社名ではない",
  scamRule: "規則による判定です。用意した名前は固定の一覧にあり、モデルには聞きません。",
  scamLate: "遅い",
  honest: "正直な納品",
  empty: "空の納品",
  askHeading: "仕事を頼む",
  briefLabel: "エージェントに何を買わせますか？",
  sampleBrief: "会社の記録を集めて",
  speak: "話す",
  listening: "聞いています…",
  budget: "予算",
  autonomy: "自律",
  levels: [
    { id: "careful", label: "Supervised" },
    { id: "balanced", label: "Supervised under a limit" },
    { id: "autopilot", label: "Automatic" },
  ],
  showCard: "計画を表示",
  approval: "計画",
  careful: "Supervised: 与信のたびに人が承認します。承認は PayPal のボタンで行います。",
  balanced: "Supervised under a limit: $50.00 までの与信は、そのまま通ります。それを超える分は人が承認します。",
  autopilot: "Automatic: 予算と上限の内側なら、与信はそのまま通ります。",
  tabBuy: "買う",
  tabScam: "エージェントを騙す",
  themeToDark: "ダーク",
  themeToLight: "ライト",
  planContinue: "承認へ進む",
  sheetTitle: "与信を承認する",
  mockApproval: "模擬の承認です。PAYPAL_CLIENT_ID が無いので、これは PayPal のボタンではありません。お金は動きません。",
  sdkLoading: "PayPal のボタンを読み込んでいます…",
  sdkFailed: "PayPal のボタンを読み込めませんでした。この承認は模擬で、お金は動きません。",
  approveHold: "与信を承認する",
  details: "詳細",
  deliveryHeading: "納品",
  deliveryWaiting: "まだ何も届いていません。",
  receiptEmpty: "PayPal の記録はまだありません。与信を置くと、最初の一行がここに出ます。",
  scamEmptyState: "偽の納品を送ってください。送るまで、確定はされません。",
  capturedWord: "CAPTURED",
  paysFor: "この与信が払うもの",
  hold: "与信",
  condition: "条件",
  shape: "形",
  ranges: "範囲",
  score: "採点",
  seller: "この売り手",
  sellerChoice: "どちらの実績",
  sellerEstablished: "実績のある売り手",
  sellerNew: "初めての売り手",
  placeHold: "与信を置く",
  order: "注文",
  authorization: "与信 ID",
  captureId: "確定",
  deliverHonest: "記録を届ける",
  deliverEmpty: "何も届けない",
  deliverLate: "遅れて届ける",
  serverDown: "サーバーが応答しません。",
  requestFailed: "依頼に失敗しました。",
  reviewHeading: "人の判断",
  reset: "見本を戻す",
  reviewLead: "見本の与信が並んでいます。本物の与信で遅れた納品もここに加わります。戻すと見本が戻ります。",
  colDecision: "判断",
  colReason: "理由",
  colHold: "与信",
  colItem: "品目",
  colKind: "種別",
  colJob: "仕事",
  colSeller: "売り手",
  colCondition: "条件",
  capture: "確定",
  void: "取り消し",
  activityHeading: "記録",
  activityLead: "各行は、PayPal が何をしたかを一文で言います。注文、与信、確定の ID は「詳細」の中です。",
  activityEmpty: "PayPal の記録はまだありません。与信を置くと、最初の一行がここに出ます。",
  colType: "種別",
  colOrder: "注文",
  colAuthorization: "与信",
  colCapture: "確定",
  colRefund: "返金",
  colVerdict: "判定",
  colHash: "台帳のハッシュ",
  ledgerHead: "台帳の先頭",
  escrow: "これはエスクローではありません。与信は PayPal に残ります。この画面が決めるのは、確定するか、取り消すか、人に回すかだけです。",
  stop: "開いている与信をすべて取り消す",
  stopped: "停止しました",
};

export function copyFor(lang: Lang): Copy {
  return lang === "ja" ? JA : EN;
}

/** Shown while the server is still fetching Qwen3. Japanese only when the screen language is Japanese. */
export function embeddingFloorLine(lang: Lang): string {
  if (lang === "ja") return "このサーバーは埋め込みの下限で採点しています。Qwen3 は読み込んでいません。";
  return "This server scores with the embedding floor. Qwen3 is not loaded.";
}

export function modelLoadingLine(lang: Lang, ratio: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  if (lang === "ja") return `AIモデルを読み込んでいます: ${pct}%`;
  return `AI model loading: ${pct}%`;
}

export function scoreLine(lang: Lang, passAt: number, voidBelow: number): string {
  const pass = passAt.toFixed(2);
  const below = voidBelow.toFixed(2);
  if (lang === "ja") return `${pass} 以上で合格。${below} 未満は取り消し。その間は人が決めます。`;
  return `Pass at ${pass} or above. Void below ${below}. Between those, a person decides.`;
}

export type PageScorePhase = { phase: "download"; ratio: number } | { phase: "ready" } | { phase: "failed" };

/** The static page cannot ship the 570MB language model, so it says which scorer it is using. */
export function scoreModelLine(lang: Lang, state: PageScorePhase): string {
  if (state.phase === "ready") {
    return lang === "ja"
      ? "Qwen3 は約 570MB で、このページには載せていません。確定には、記録された yes と見本への埋め込みの近さが両方要ります。"
      : "Qwen3 is about 570MB and is not loaded here. Capture needs a recorded yes and embedding similarity to the company exemplars.";
  }
  if (state.phase === "failed") {
    return lang === "ja"
      ? "埋め込みモデルを読み込めませんでした。モデルでは採点していないので、このページは確定しません。"
      : "The embedding model did not load. Nothing was scored by a model, so this page will not capture.";
  }
  const pct = Math.round(Math.max(0, Math.min(1, state.ratio)) * 100);
  return lang === "ja"
    ? `言語モデルは約 570MB あるため、埋め込みモデルを読み込んでいます（${pct}%）。`
    : `The language model is about 570MB, so this page is loading an embedding model (${pct}%).`;
}

const SELLER_LINE = /^(\d+) paid purchases, (\d+\.\d%) matched the promised shape, (\d+\.\d%) errors after payment$/;
const SAMPLE_SELLER_LINE = "Sample seller. No outlet in the frozen export matches this job.";

export function presentSellerLine(lang: Lang, line: string): string {
  if (lang === "en") return line;
  if (line === SAMPLE_SELLER_LINE) return "見本の売り手です。凍結した書き出しに、この仕事に合う売り口はありません。";
  const matched = SELLER_LINE.exec(line);
  if (!matched) return line;
  return `${matched[1]} 件の支払い済み、形の一致 ${matched[2]}、支払い後のエラー ${matched[3]}`;
}

const DESCRIPTION_EN = "A list of companies with name, ISO country code, employee count, founding year and a source URL.";

export function presentDescription(lang: Lang, description: string): string {
  if (lang === "en" || description !== DESCRIPTION_EN) return description;
  return "会社の名前、ISO 国コード、従業員数、設立年、出典 URL の一覧。";
}

const LABELS: Record<string, string> = {
  "First half of the delivery": "納品の前半",
  "Second half of the delivery": "納品の後半",
};

const PROGRESS: Record<string, string> = {
  "PASS → captured": "合格 → 確定",
  "FAIL → voided": "不合格 → 取り消し",
  "UNSURE → human": "不明 → 人へ",
  waiting: "待ち",
};

const REASONS: Record<string, string> = {
  late: "遅延",
  score_uncertain: "採点が中間",
  scorer_invalid: "採点が無効",
  suspicious_field: "疑わしい欄",
  unsure: "不明",
};

const KINDS: Record<string, string> = {
  sample: "見本",
  live: "本番",
};

const DECISIONS: Record<string, string> = {
  capture: "確定",
  void: "取り消し",
  open: "未決",
};

export function presentReason(lang: Lang, reason: string): string {
  if (lang === "en") return reason;
  return REASONS[reason] ?? reason;
}

export function presentKind(lang: Lang, kind: string): string {
  if (lang === "en") return kind;
  return KINDS[kind] ?? kind;
}

export function presentDecision(lang: Lang, decision: string): string {
  if (lang === "en") return decision;
  return DECISIONS[decision] ?? decision;
}

export function presentHoldReason(lang: Lang, reason: string): string {
  if (lang === "en") return reason;
  if (reason === "Established seller: one hold for the whole job") return "実績のある売り手: 仕事全体を1回で与信します";
  const match = /^(New seller|Uncertain seller): holding in (\d+) parts?$/.exec(reason);
  if (!match) return reason;
  const who = match[1] === "New seller" ? "初めての売り手" : "実績の少ない売り手";
  return `${who}: ${match[2]}回に分けて与信します`;
}

export interface ShownJob {
  status: string;
  holdCents: number;
  capturedCents: number;
  summary: string;
  sellerLine: string;
  holdQuestion: string;
  holdReason?: string;
  countLine?: string;
  condition: { description: string };
  items: { label: string; progress: string; price: string }[];
}

export function presentSummary(lang: Lang, job: Pick<ShownJob, "status" | "holdCents" | "capturedCents" | "summary">): string {
  if (lang === "en") return job.summary;
  const hold = formatUsd(job.holdCents);
  const captured = formatUsd(job.capturedCents);
  const released = formatUsd(Math.max(0, job.holdCents - job.capturedCents));
  if (job.status === "voided") return "$0。失ったお金はありません。";
  if (job.status === "captured") return `${hold} の与信のうち ${captured} を確定しました。${released} は解放しました。`;
  if (job.status === "needs_human") return `${hold} の与信は、人が決めるまで開いたままです。`;
  if (job.status === "authorized" || job.status === "pending_human") return `${hold} の与信は開いています。`;
  if (job.status === "planned") return "まだ何も与信していません。";
  return "この与信は通りませんでした。";
}

export function presentHoldQuestion(lang: Lang, holdCents: number, english: string): string {
  if (lang === "en") return english;
  return `${formatUsd(holdCents)} の与信を、各納品の確認が終わるまで置いてよいですか？`;
}

/** Translate the words around a job. Prices, ids, and the English view stay as they are. */
export function screenJob<T extends ShownJob>(job: T, lang: Lang): T {
  if (lang === "en") return job;
  const next = {
    ...job,
    sellerLine: presentSellerLine(lang, job.sellerLine),
    holdQuestion: presentHoldQuestion(lang, job.holdCents, job.holdQuestion),
    summary: presentSummary(lang, job),
    condition: { ...job.condition, description: presentDescription(lang, job.condition.description) },
    items: job.items.map((item) => ({
      ...item,
      label: LABELS[item.label] ?? item.label,
      progress: PROGRESS[item.progress] ?? item.progress,
    })),
  };
  if (typeof job.holdReason === "string") next.holdReason = presentHoldReason(lang, job.holdReason);
  if (typeof job.countLine === "string") next.countLine = presentCountLine(lang, job.countLine);
  return next;
}

function presentCountLine(lang: Lang, line: string): string {
  if (lang === "en") return line;
  const match = /^(\d+) records · (\$[\d.]+) each · (\$[\d.]+) hold$/.exec(line);
  if (!match) return line;
  return `${match[1]} 件 · 1件 ${match[2]} · 与信 ${match[3]}`;
}

const ERRORS: Record<string, string> = {
  "The server is not answering.": "サーバーが応答しません。",
  "The request failed.": "依頼に失敗しました。",
  "emergency stop is on; new holds are refused": "非常停止中です。新しい与信は拒否されます。",
  "place the hold first": "先に与信を置いてください。",
  "no such job": "その仕事はありません。",
  "no such review row": "その審査行はありません。",
};

export function presentError(lang: Lang, message: string): string {
  if (lang === "en") return message;
  return ERRORS[message] ?? message;
}

const REASON_SENTENCE_EN: Record<string, string> = {
  ok: "It matched the condition.",
  paid_5xx: "The seller answered with a server error after payment.",
  paid_4xx: "The seller answered with a client error after payment.",
  non_2xx: "The seller did not answer with a success status.",
  empty_200: "The body was empty.",
  not_json: "The body was not JSON.",
  shape_mismatch: "A field was missing or had the wrong type.",
  out_of_range: "A value was outside the range fixed before the hold.",
  late: "The reply was later than the condition allows.",
  score_low: "The score was too low to pay.",
  score_uncertain: "The score was in the middle, so a person decides.",
  scorer_invalid: "The score was not a usable number, so a person decides.",
  suspicious_field: "A field read like an instruction, so it was not captured.",
};

const REASON_SENTENCE_JA: Record<string, string> = {
  ok: "条件に合いました。",
  paid_5xx: "支払いのあと、売り手がサーバーエラーを返しました。",
  paid_4xx: "支払いのあと、売り手がクライアントエラーを返しました。",
  non_2xx: "売り手は成功のステータスを返しませんでした。",
  empty_200: "本文が空でした。",
  not_json: "本文が JSON ではありませんでした。",
  shape_mismatch: "欄が欠けているか、型が違います。",
  out_of_range: "値が、与信の前に決めた範囲の外でした。",
  late: "返答が、条件の許す時間より遅かったです。",
  score_low: "採点が低く、支払いません。",
  score_uncertain: "採点が中間なので、人が決めます。",
  scorer_invalid: "採点が使える数ではなかったので、人が決めます。",
  suspicious_field: "欄が指示文のように読めたので、確定しませんでした。",
};

export function reasonSentence(lang: Lang, reason: string): string {
  const table = lang === "ja" ? REASON_SENTENCE_JA : REASON_SENTENCE_EN;
  return table[reason] ?? (lang === "ja" ? "与信の前に固定した条件に合いませんでした。" : "It did not match the condition fixed before the hold.");
}

/** One plain sentence for a scam result. Ids stay out of this sentence. */
export function scamSentence(lang: Lang, result: { outcome: string; reason: string; amount: string; basis?: "rule" | "scorer" | null }): string {
  if (result.basis === "rule" && result.outcome !== "capture") {
    return lang === "ja"
      ? "確定しませんでした。規則による判定です。この名前は固定の一覧にあり、モデルには聞いていません。"
      : "Nothing was captured. Judged by a rule. This name is on a fixed list, so no model was asked.";
  }
  if (result.outcome === "capture") {
    return lang === "ja" ? `これは通りました。確定は ${result.amount} です。` : `This one got through. Captured ${result.amount}.`;
  }
  if (result.outcome === "human") {
    return lang === "ja" ? "人が見るまで、確定しません。" : "A person has to look before anything is captured.";
  }
  const why = reasonSentence(lang, result.reason);
  return lang === "ja" ? `確定しませんでした。${why}` : `Nothing was captured. ${why}`;
}

export function deliverySentence(lang: Lang, progress: string): string {
  if (progress.startsWith("PASS") || progress.startsWith("合格")) {
    return lang === "ja" ? "条件に合ったので、この分は確定します。" : "It matched the condition, so this part is captured.";
  }
  if (progress.startsWith("FAIL") || progress.startsWith("不合格")) {
    return lang === "ja" ? "条件に合わなかったので、この分は確定しません。" : "It failed the check, so this part is not captured.";
  }
  if (progress.startsWith("UNSURE") || progress.startsWith("不明")) {
    return lang === "ja" ? "人が決めるまで、この分は確定しません。" : "A person decides this part before anything is captured.";
  }
  return lang === "ja" ? "まだ届いていません。" : "This part has not arrived yet.";
}

export function activitySentence(lang: Lang, type: string, opts?: { replay?: boolean; verdict?: string | null }): string {
  const en: Record<string, string> = {
    authorize: "PayPal placed a hold. Nothing is captured until the delivery is checked.",
    capture: "PayPal captured the part that passed and released the rest.",
    void: "PayPal released the hold. Nothing was captured.",
    refund: "PayPal refunded a capture.",
    deny: "The hold was refused before PayPal moved any money.",
    human: "A person has to decide this one.",
    allow: "The rules allowed this hold.",
    stop: "Every open hold was released.",
  };
  const ja: Record<string, string> = {
    authorize: "PayPal が与信を置きました。納品を確かめるまで、確定はしません。",
    capture: "合格した分を PayPal が確定し、残りは解放しました。",
    void: "PayPal が与信を解放しました。確定したお金はありません。",
    refund: "PayPal が確定分を返金しました。",
    deny: "PayPal がお金を動かす前に、与信は拒否されました。",
    human: "これは人が決めます。",
    allow: "ルールがこの与信を許しました。",
    stop: "開いている与信を、すべて解放しました。",
  };
  const table = lang === "ja" ? ja : en;
  const captured = type === "capture" || (opts?.replay === true && type === "human" && opts.verdict === "capture");
  const line = table[captured ? "capture" : type] ?? (lang === "ja" ? "この仕事に、PayPal の記録が一行増えました。" : "PayPal recorded another step on this job.");
  if (opts?.replay === true && captured) {
    return lang === "ja"
      ? `${line} これは記録の再生です。この画面は PayPal を呼びません。`
      : `${line} Recorded replay. This page does not call PayPal.`;
  }
  return line;
}

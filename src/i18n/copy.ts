import { formatUsd } from "../policy/money.js";

/** Screen language. Amounts and ids are not translated. */
export type Lang = "en" | "ja";

/** Shown on the static page in both languages. Money does not move. */
export const SIMULATED_BANNER = "模擬・お金は動かない";

export function langFromSearch(search: string): Lang {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("lang") === "ja" ? "ja" : "en";
}

export interface Copy {
  lang: Lang;
  htmlLang: Lang;
  speechLang: "en-US" | "ja-JP";
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
  paysFor: string;
  hold: string;
  condition: string;
  shape: string;
  ranges: string;
  score: string;
  seller: string;
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
  { id: "careful", label: "Careful" },
  { id: "balanced", label: "Balanced" },
  { id: "autopilot", label: "Autopilot" },
];

const EN: Copy = {
  lang: "en",
  htmlLang: "en",
  speechLang: "en-US",
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
  truthPlay: "Run the 50 records",
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
  showCard: "Show the approval card",
  approval: "Approval",
  careful: "Careful: a person approves every hold. The yes below is that approval.",
  balanced: "Balanced: holds up to $50.00 can go through on their own. Above that, a person approves. The yes below is yours.",
  autopilot: "Autopilot: inside the budget and the caps, the yes below places the hold.",
  paysFor: "What the hold pays for",
  hold: "Hold",
  condition: "Condition",
  shape: "Shape",
  ranges: "Ranges",
  score: "Score",
  seller: "This seller",
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
  activityLead: "Every PayPal id from this process, the verdict, and the hash of the ledger line.",
  activityEmpty: "No PayPal calls yet. A hold writes the first order id here.",
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
  truthPlay: "50件を判定する",
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
    { id: "careful", label: "慎重（Careful）" },
    { id: "balanced", label: "標準（Balanced）" },
    { id: "autopilot", label: "自動（Autopilot）" },
  ],
  showCard: "承認カードを表示",
  approval: "承認",
  careful: "慎重（Careful）: 与信のたびに人が承認します。下の承諾が、その承認です。",
  balanced: "標準（Balanced）: $50.00 までの与信は、そのまま通ります。それを超える分は人が承認します。下の承諾が、あなたの承認です。",
  autopilot: "自動（Autopilot）: 予算と上限の内側なら、下の承諾で与信します。",
  paysFor: "この与信が払うもの",
  hold: "与信",
  condition: "条件",
  shape: "形",
  ranges: "範囲",
  score: "採点",
  seller: "この売り手",
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
  activityLead: "この処理の PayPal ID、判定、台帳の行のハッシュです。",
  activityEmpty: "まだ PayPal の呼び出しはありません。与信を置くと、最初の注文 ID がここに出ます。",
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
      ? "言語モデルは約 570MB あるため、このページは埋め込みの近さで採点しています。"
      : "The language model is about 570MB, so this page scores by embedding similarity.";
  }
  if (state.phase === "failed") {
    return lang === "ja"
      ? "言語モデルは重すぎ、埋め込みモデルも読めなかったため、欄が埋まっているかだけで採点しています。"
      : "The language model is too heavy, and the embedding model did not load. This page only checks that the text fields are filled in.";
  }
  const pct = Math.round(Math.max(0, Math.min(1, state.ratio)) * 100);
  return lang === "ja"
    ? `言語モデルは約 570MB あるため、埋め込みモデルを読み込んでいます（${pct}%）。`
    : `The language model is about 570MB, so this page is loading an embedding model (${pct}%).`;
}

const SELLER_LINE = /^(\d+) paid purchases, (\d+\.\d%) matched the promised shape, (\d+\.\d%) errors after payment$/;

export function presentSellerLine(lang: Lang, line: string): string {
  if (lang === "en") return line;
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

export interface ShownJob {
  status: string;
  holdCents: number;
  capturedCents: number;
  summary: string;
  sellerLine: string;
  holdQuestion: string;
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
  return {
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

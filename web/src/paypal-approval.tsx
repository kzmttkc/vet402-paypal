import { useEffect, useRef, useState } from "react";
import type { Copy } from "../../src/i18n/copy.js";

export type PaypalButtonConfig = {
  sdk: "v6";
  script: string | null;
  clientId: string | null;
  mode: "sandbox" | "mock";
};

type PaypalSession = {
  start(presentation: { presentationMode: "auto" }, order: Promise<{ orderId: string }>): Promise<void>;
};

type PaypalClient = {
  findEligibleMethods(input?: { currencyCode?: string }): Promise<{ isEligible(name: string): boolean }>;
  createPayPalOneTimePaymentSession(options: {
    onApprove: (data: { orderId: string }) => Promise<void> | void;
    onCancel?: () => void;
    onError?: (error: unknown) => void;
  }): PaypalSession | Promise<PaypalSession>;
};

type PaypalWindow = Window & {
  paypal?: {
    createInstance(options: { clientId: string; components: string[] }): Promise<PaypalClient>;
  };
};

const loads = new Map<string, Promise<void>>();

function loadPaypalScript(src: string): Promise<void> {
  const existing = loads.get(src);
  if (existing) return existing;
  const pending = new Promise<void>((resolve, reject) => {
    if (document.querySelector('script[data-paypal-sdk="v6"]') && (window as PaypalWindow).paypal) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.paypalSdk = "v6";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("PayPal's button did not load."));
    document.head.appendChild(script);
  });
  loads.set(src, pending);
  pending.catch(() => loads.delete(src));
  return pending;
}

function OfficialButton({
  copy,
  config,
  busy,
  onCreateOrder,
  onApproved,
  onFallback,
}: {
  copy: Copy;
  config: PaypalButtonConfig;
  busy: boolean;
  onCreateOrder: () => Promise<string>;
  onApproved: (orderId: string) => Promise<void>;
  onFallback: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const createRef = useRef(onCreateOrder);
  const approvedRef = useRef(onApproved);
  createRef.current = onCreateOrder;
  approvedRef.current = onApproved;
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const slot = host.current;
    if (!slot || !config.script || !config.clientId) return;
    let cancel = false;
    void (async () => {
      try {
        await loadPaypalScript(config.script!);
        const paypal = (window as PaypalWindow).paypal;
        if (cancel || !paypal) throw new Error("PayPal's button did not load.");
        const sdk = await paypal.createInstance({
          clientId: config.clientId!,
          components: ["paypal-payments"],
        });
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (!methods.isEligible("paypal")) throw new Error("PayPal is not eligible here.");
        const session = await sdk.createPayPalOneTimePaymentSession({
          onApprove: (data) => approvedRef.current(data.orderId),
          onError: () => setPhase("failed"),
        });
        if (cancel) return;
        const button = document.createElement("paypal-button");
        button.setAttribute("type", "pay");
        slot.replaceChildren(button);
        button.addEventListener("click", () => {
          const order = createRef.current().then((orderId) => ({ orderId }));
          void session.start({ presentationMode: "auto" }, order);
        });
        setPhase("ready");
      } catch {
        if (!cancel) setPhase("failed");
      }
    })();
    return () => {
      cancel = true;
      slot.replaceChildren();
    };
  }, [config.clientId, config.script]);

  return (
    <div data-testid="paypal-official">
      {phase === "loading" && <p>{copy.sdkLoading}</p>}
      <div ref={host} />
      {phase === "failed" && (
        <>
          <p data-testid="mock-approval">{copy.sdkFailed}</p>
          <button type="button" className="yes" data-testid="mock-approve" disabled={busy} onClick={onFallback}>
            {copy.approveHold}
          </button>
        </>
      )}
    </div>
  );
}

export function ApprovalSheet({
  copy,
  config,
  official,
  busy,
  question,
  note,
  onCreateOrder,
  onApproved,
  onMockApprove,
}: {
  copy: Copy;
  config: PaypalButtonConfig | null;
  official: boolean;
  busy: boolean;
  question: string;
  note: string;
  onCreateOrder: () => Promise<string>;
  onApproved: (orderId: string) => Promise<void>;
  onMockApprove: () => void;
}) {
  const live = official && config?.mode === "sandbox" && config.clientId && config.script;
  return (
    <section className="sheet" data-testid="approval-sheet" aria-labelledby="sheet-title">
      <h2 id="sheet-title">{copy.sheetTitle}</h2>
      <p className="ask" data-testid="approval-hold-question">
        {question}
      </p>
      {!config && <p>{copy.sdkLoading}</p>}
      {config && live && (
        <OfficialButton
          copy={copy}
          config={config}
          busy={busy}
          onCreateOrder={onCreateOrder}
          onApproved={onApproved}
          onFallback={onMockApprove}
        />
      )}
      {config && !live && (
        <>
          <p data-testid="mock-approval">{note}</p>
          <button type="button" className="yes" data-testid="mock-approve" disabled={busy} onClick={onMockApprove}>
            {copy.approveHold}
          </button>
        </>
      )}
    </section>
  );
}

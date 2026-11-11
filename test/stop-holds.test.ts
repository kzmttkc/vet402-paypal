import { describe, expect, it } from "vitest";
import { activitySentence, holdsWaitingLine, presentDecision, sandboxRunBand, simulatedPlayLine } from "../src/i18n/copy.js";
import { tickerLine } from "../src/demo/nov7.js";
import { holdViews } from "../src/review/holds.js";
import { createDemoDesk } from "../src/demo/browser-desk.js";
import { createBrowserTransport } from "../web/src/browser-api.js";
import type { ReviewRow } from "../src/server/desk.js";

describe("emergency stop closes the sample holds", () => {
  it("voids the three waiting samples and writes one activity line", async () => {
    const desk = createDemoDesk();
    const before = holdViews(desk.review().rows);
    expect(before.filter((hold) => hold.decision === "open")).toHaveLength(3);
    expect(holdsWaitingLine("en", 3)).toBe("3 holds waiting");

    await desk.emergencyStop("owner pressed stop");

    const after = holdViews(desk.review().rows);
    expect(after.filter((hold) => hold.decision === "open")).toHaveLength(0);
    expect(holdsWaitingLine("en", 0)).toBe("0 holds waiting");
    expect(after.filter((hold) => hold.kind === "sample").map((hold) => presentDecision("en", hold.decision))).toEqual([
      "VOIDED",
      "VOIDED",
      "VOIDED",
    ]);
    const lines = desk.activity().entries.map((entry) => activitySentence("en", entry.type, { verdict: entry.verdict }));
    expect(lines).toContain("Voided 3 open holds.");
  });

  it("does the same through the static page /api/stop", async () => {
    const api = createBrowserTransport();
    const before = await api<{ rows: ReviewRow[] }>("/api/review");
    expect(holdViews(before.rows).filter((hold) => hold.decision === "open")).toHaveLength(3);

    const stopped = await api<{ stopped: boolean; voided: string[] }>("/api/stop", { reason: "owner pressed stop" });
    expect(stopped.stopped).toBe(true);

    const after = await api<{ rows: ReviewRow[] }>("/api/review");
    const holds = holdViews(after.rows);
    expect(holds.filter((hold) => hold.decision === "open")).toHaveLength(0);
    expect(holds.every((hold) => presentDecision("en", hold.decision) === "VOIDED")).toBe(true);

    const act = await api<{ entries: { type: string; verdict: string | null }[] }>("/api/activity");
    const lines = act.entries.map((entry) => activitySentence("en", entry.type, { verdict: entry.verdict }));
    expect(lines).toEqual(["Voided 3 open holds."]);
  });
});

describe("sandbox record and play result labels", () => {
  it("marks the Nov 7 band as a saved run and the play line as simulated", () => {
    const band = sandboxRunBand(tickerLine());
    expect(band.startsWith("Sandbox run, Nov 7 · ")).toBe(true);
    expect(band).toContain("authorized $50.00");
    expect(band).toContain("captured $12.50");
    expect(band).toContain("order 68V137364A632645V");
    expect(simulatedPlayLine("Captured $37.00 of $50.00. $13.00 released.")).toBe(
      "Simulated: Captured $37.00 of $50.00. $13.00 released.",
    );
  });
});

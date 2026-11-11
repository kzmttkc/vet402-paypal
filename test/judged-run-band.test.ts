import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { judgedRunBand } from "../src/i18n/copy.js";
import { formatUsd } from "../src/policy/money.js";

const saved = JSON.parse(readFileSync(new URL("../docs/sandbox-judged-run.json", import.meta.url), "utf8")) as {
  holdCents: number;
  capturedCents: number;
  records: { outcome: string }[];
  readBack: { capture: { id: string } };
};

const ENGLISH =
  "Sandbox run, Nov 10 · the judge passed 40 of 50 · captured $40.00 of $50.00 · capture 5DC328323E0217202";

const JAPANESE =
  "\u30b5\u30f3\u30c9\u30dc\u30c3\u30af\u30b9\u306e\u5b9f\u884c\uff0811/10\uff09\u30fb\u5224\u5b9a\u304c 50 \u4ef6\u4e2d 40 \u4ef6\u3092\u901a\u904e\u30fb$50.00 \u306e\u3046\u3061 $40.00 \u3092\u78ba\u5b9a\u30fbcapture 5DC328323E0217202";

describe("Nov 10 judged run band", () => {
  it("matches the saved capture counts and id", () => {
    const passed = saved.records.filter((row) => row.outcome === "capture").length;
    const total = saved.records.length;
    const line = judgedRunBand("en");

    expect(passed).toBe(40);
    expect(total).toBe(50);
    expect(saved.capturedCents).toBe(4000);
    expect(saved.holdCents).toBe(5000);
    expect(saved.readBack.capture.id).toBe("5DC328323E0217202");
    expect(line).toBe(ENGLISH);
    expect(line).toContain(`passed ${passed} of ${total}`);
    expect(line).toContain(`captured ${formatUsd(saved.capturedCents)} of ${formatUsd(saved.holdCents)}`);
    expect(line).toContain(`capture ${saved.readBack.capture.id}`);
    expect(judgedRunBand("ja")).toBe(JAPANESE);
    expect(judgedRunBand("ja")).toContain(saved.readBack.capture.id);
    expect(judgedRunBand("ja")).toContain(formatUsd(saved.capturedCents));
    expect(judgedRunBand("ja")).toContain(formatUsd(saved.holdCents));
  });
});

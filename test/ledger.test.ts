import { describe, expect, it } from "vitest";
import { canonicalJson, Ledger } from "../src/ledger/index.js";

describe("hash-chained ledger", () => {
  const build = () => {
    const l = new Ledger(() => 1);
    l.append("allow", "j", { amountCents: 100 });
    l.append("authorize", "j", { authorizationId: "A" });
    l.append("capture", "j", { amountCents: 100 });
    return l;
  };

  it("verifies an untouched chain, and survives a JSONL round trip", () => {
    const l = build();
    expect(l.verifyChain()).toEqual({ ok: true, length: 3 });
    expect(Ledger.fromJsonl(l.toJsonl()).verifyChain().ok).toBe(true);
  });

  it("a rewritten middle line is detected at that line", () => {
    const lines = build().toJsonl().split("\n");
    lines[1] = lines[1]!.replace('"A"', '"B"');
    const r = Ledger.fromJsonl(lines.join("\n")).verifyChain();
    expect(r).toMatchObject({ ok: false, brokenAt: 1 });
  });

  it("a deleted line is detected", () => {
    const lines = build().toJsonl().split("\n");
    lines.splice(1, 1);
    expect(Ledger.fromJsonl(lines.join("\n")).verifyChain().ok).toBe(false);
  });

  it("a rewritten line with a recomputed hash still breaks the next link", () => {
    const l = build();
    const rows = JSON.parse(`[${l.toJsonl().trim().split("\n").join(",")}]`);
    rows[0].data.amountCents = 1;
    // attacker recomputes row 0's own hash, but row 1 still points at the old one
    const fake = new Ledger(() => 1);
    fake.append("allow", "j", { amountCents: 1 });
    rows[0].hash = fake.entries()[0]!.hash;
    const r = Ledger.fromJsonl(rows.map((x: unknown) => JSON.stringify(x)).join("\n")).verifyChain();
    expect(r).toMatchObject({ ok: false, brokenAt: 1 });
  });

  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });
});

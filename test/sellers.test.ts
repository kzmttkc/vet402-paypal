import { describe, expect, it } from "vitest";
import { aggregateSellers, approvalSentence, loadFrozenExport, parseCsv, pickSeller, sellerCard, totalsOf, type ExportRow } from "../src/sellers/index.js";

const row = (o: Partial<ExportRow>): ExportRow => ({ resource_key: "a", status: "settled", http_status_paid: "200", l2_schema: "match", latency_ms: "100", ...o });

describe("csv", () => {
  it("handles quotes, commas and newlines inside fields", () => {
    expect(parseCsv('a,b\n"x,1","he said ""hi""\nok"\n')).toEqual([["a", "b"], ["x,1", 'he said "hi"\nok']]);
  });
});

describe("seller track record", () => {
  it("counts only settled purchases for errors after payment and shape checks", () => {
    const m = aggregateSellers([
      row({}),
      row({ l2_schema: "mismatch" }),
      row({ http_status_paid: "404", l2_schema: "not_checked" }),
      row({ http_status_paid: "502", l2_schema: "" }),
      row({ status: "settle_failed", http_status_paid: "400" }),
      row({ resource_key: "b", l2_schema: "no_declaration" }),
    ]);
    const a = m.get("a")!;
    expect([a.attempts, a.settled, a.paid4xx, a.paid5xx, a.shapeMatch, a.shapeMismatch]).toEqual([5, 4, 1, 1, 1, 1]);
    expect(a.shapeMatchRate).toBe(0.5);
    expect(a.postPayErrorRate).toBe(0.5);
    expect(m.get("b")!.shapeMatchRate).toBeNull();
    expect(sellerCard(a)).toBe("a: settled 4, shape match 50.0% (1/2), errors after payment 50.0%");
    expect(approvalSentence(a)).toBe("4 paid purchases, 50.0% matched the promised shape, 50.0% errors after payment");
  });

  it("picks the settled seller with the most paid purchases", () => {
    const m = aggregateSellers([
      row({ resource_key: "small", status: "settled" }),
      row({ resource_key: "big" }),
      row({ resource_key: "big" }),
      row({ resource_key: "unchecked", l2_schema: "not_checked" }),
    ]);
    expect(pickSeller(m).resourceKey).toBe("big");
  });

  it("prefers a seller whose deliveries matched the shape over a busier seller that missed it", () => {
    const m = aggregateSellers([
      row({ resource_key: "busy", l2_schema: "mismatch" }),
      row({ resource_key: "busy", l2_schema: "mismatch" }),
      row({ resource_key: "busy", l2_schema: "mismatch" }),
      row({ resource_key: "careful" }),
    ]);
    expect(pickSeller(m).resourceKey).toBe("careful");
  });

  it("frozen export: per-seller sums equal the export totals (counted independently on 2026-11-07)", () => {
    const { rows, meta } = loadFrozenExport();
    expect(meta.sha256).toBe("c0fea21a1b476ec853588f1215da174d29cfe0d823ad0877719fe75cbb232169");
    const t = totalsOf(rows);
    // Independent count: Python csv.DictReader over the same file.
    expect(t).toEqual({ rows: 22_071, sellers: 11_766, settled: 13_893, paid4xx: 736, paid5xx: 121, shapeMatch: 4_206, shapeMismatch: 741 });
    expect(rows.filter((r) => r.status === "settled").length).toBe(t.settled);
  });
});

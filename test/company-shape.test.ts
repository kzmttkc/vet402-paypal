import { describe, expect, it } from "vitest";
import { OFF_TOPIC_NAMES } from "../eval/cases.js";
import { HELD_OUT_NAMES } from "../eval/held-out-names.js";
import {
  CALIBRATION_COMPANIES,
  CALIBRATION_OTHERS,
  COMPANY_EXEMPLARS,
  COMPANY_SHAPE_MIN,
  embeddingCompanyShape,
} from "../src/verify/company-shape.js";

describe("company shape", () => {
  it("calls a name company-like only when it is nearer the exemplars than every calibration phrase that is not a company", async () => {
    const embed = async (text: string) => (text === "Porcelain Mug" ? Float32Array.of(0, 1) : Float32Array.of(1, 0));
    expect(COMPANY_SHAPE_MIN).toBeGreaterThan(0);
    expect(COMPANY_SHAPE_MIN).toBeLessThan(1);
    await expect(embeddingCompanyShape("Microsoft Corporation", embed)).resolves.toBe(true);
    await expect(embeddingCompanyShape("Porcelain Mug", embed)).resolves.toBe(false);
  });

  it("keeps the calibration names off the exemplar list and off the held-out set", () => {
    const exemplars = new Set<string>(COMPANY_EXEMPLARS);
    const heldOut = new Set(HELD_OUT_NAMES.map((row) => row.text));
    const blocked = new Set<string>(OFF_TOPIC_NAMES);
    const companies = new Set<string>(CALIBRATION_COMPANIES);
    const others = new Set<string>(CALIBRATION_OTHERS);
    expect(new Set([...exemplars, ...companies, ...others, ...heldOut, ...blocked]).size).toBe(
      exemplars.size + companies.size + others.size + heldOut.size + blocked.size,
    );
  });
});

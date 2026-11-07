import type { ConditionSpec } from "./condition.js";
import type { CompanyShape } from "./company-shape.js";
import { contentFieldPaths } from "./language.js";
import { valuesAt } from "./paths.js";
import { recordedCompanyAnswer } from "./recorded-qwen.js";
import { humanBandScore, instructionShape } from "./score.js";

/**
 * Static-page score. Capture (0.95) only when a recorded Qwen3 yes and the exemplar check both agree.
 * A missing yes is not a yes. Disagreement stays in the human band. Both no, or a missing yes on a
 * name the exemplars reject, is 0.15. This function does not download Qwen3.
 */
export async function scorePageDelivery(spec: ConditionSpec, data: unknown, shape: CompanyShape): Promise<number> {
  let mismatch = false;
  let split = false;
  let saw = false;
  for (const path of contentFieldPaths(spec)) {
    for (const value of valuesAt(data, path).values) {
      if (typeof value !== "string") continue;
      saw = true;
      if (instructionShape(value)) return humanBandScore(spec.ai);
      const form = await shape(value);
      const answer = recordedCompanyAnswer(value);
      if (answer === "yes" && form) continue;
      if ((answer === "no" || answer === null) && !form) {
        mismatch = true;
        continue;
      }
      split = true;
    }
  }
  if (!saw || split) return humanBandScore(spec.ai);
  if (mismatch) return 0.15;
  return 0.95;
}

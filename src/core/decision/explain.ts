// src/core/decision/explain.ts
// Optional LLM explanations for decision-engine hits.
// Input: already-computed recommendations + canonical vars.
// Output: prose only — NEVER new numbers (ADD §15).

import { generateObject } from "ai";
import { z } from "zod";
import { tryModels } from "@/lib/ai";
import type { RecommendationT } from "@/shared/models/decision";

// Cross-provider: .nullable() not .optional(), plain numbers/strings.
const ExplanationSet = z.object({
  items: z.array(
    z.object({
      ruleId: z.string(),
      explanation: z.string(),
    }),
  ),
});

/**
 * Best-effort: attach an explanation to each recommendation.
 * On any AI failure, returns the input unchanged (engine still works offline).
 */
export async function explainRecommendations(
  recommendations: RecommendationT[],
  vars: Record<string, number>,
): Promise<RecommendationT[]> {
  if (recommendations.length === 0) return recommendations;

  const catalog = recommendations
    .map(
      (r) =>
        `- ruleId=${r.ruleId} v${r.ruleVersion} severity=${r.severity}: "${r.text}" (matched vars: ${JSON.stringify(r.vars)})`,
    )
    .join("\n");

  // Round numbers for the prompt so the model is not tempted to recompute.
  const varLines = Object.entries(vars)
    .filter(([k]) => !k.includes(".")) // keep prompt small: top-level only
    .map(([k, v]) => `${k}=${typeof v === "number" ? Number(v.toFixed(4)) : v}`)
    .join(", ");

  try {
    const { object } = await tryModels(
      (model) =>
        generateObject({
          model,
          schema: ExplanationSet,
          prompt: [
            "You explain manufacturing quality decision-engine recommendations to a Quality Manager.",
            "Rules already fired; numbers are GIVEN and must not be recalculated or invented.",
            "For each ruleId write 1–2 plain sentences: why it matters and what to do next.",
            "Do NOT introduce any new numeric values, percentages, or costs.",
            "Do NOT change the recommendation text.",
            "",
            `Canonical variables (read-only): ${varLines}`,
            "",
            "Recommendations to explain:",
            catalog,
            "",
            "Return one item per ruleId.",
          ].join("\n"),
        }),
      { fast: true },
    );

    const byId = new Map(object.items.map((i) => [i.ruleId, i.explanation]));
    return recommendations.map((r) => ({
      ...r,
      explanation: byId.get(r.ruleId) ?? r.explanation,
    }));
  } catch {
    return recommendations;
  }
}

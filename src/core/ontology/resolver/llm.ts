// src/core/ontology/resolver/llm.ts
// Rung 5: LLM semantic resolution via the tryModels chain. Receives ONLY the
// still-unresolved proposals plus a compact structural context — never raw
// rows. Output is Zod-validated proposals; the ladder records them as
// LLM-resolved, and the user still verifies (rung 6). Proposes, never applies.

import { generateObject } from "ai";
import { z } from "zod";
import { tryModels } from "@/lib/ai";
import type { MappingProposalT } from "@/shared/models/entities";
import type { ResolverSheet } from "./ladder";
import { GLOBAL_ONTOLOGY_SEED } from "@/core/ontology/global-ontology";

// Cross-provider rules (src/lib/schemas.ts): .nullable() not .optional(),
// no literal unions, plain numbers.
const LlmMapping = z.object({
  entityId: z.string(),
  canonical: z.string().nullable(),
  kind: z.enum(["stage", "measure", "defect", "dimension", "size", "date", "derived", "meta"]),
  confidence: z.number(),
  reason: z.string(),
});
const LlmMappingSet = z.object({ mappings: z.array(LlmMapping) });

export async function llmResolve(
  unresolved: MappingProposalT[],
  sheets: ResolverSheet[],
): Promise<Map<string, { canonical: string; kind: MappingProposalT["kind"]; confidence: number; reason: string }>> {
  const concepts = GLOBAL_ONTOLOGY_SEED.map((c) => `${c.conceptId} (${c.kind}): ${c.description}`).join("\n");
  const structure = sheets
    .map((s) => `Sheet "${s.sheetName}" (file "${s.fileName}"): columns ${s.columns.map((c) => `"${c.name}" [${c.type}/${c.role}]`).join(", ")}`)
    .join("\n");
  const targets = unresolved
    .map((p) => `- entityId ${p.entityId}: ${p.original.colLetter ? `column "${p.original.header}" on sheet "${p.original.sheet}"` : `sheet "${p.original.header}"`} (current kind guess: ${p.kind})`)
    .join("\n");

  const { object } = await tryModels((model) =>
    generateObject({
      model,
      schema: LlmMappingSet,
      prompt: [
        "You are resolving manufacturing spreadsheet fields to a canonical ontology.",
        "Identify every listed entity. Never omit one. If uncertain, keep canonical null and say why — do NOT invent.",
        "Canonical vocabulary:",
        "- measures/dimensions: one of the concept ids below (e.g. CHECKED_QTY, REJECTED_QTY, DATE, SIZE).",
        "- defect tally columns: DEFECT:<CODE> where CODE is the column's code collapsed to A-Z0-9.",
        "- sheets that represent a process/inspection stage: STAGE:<kebab-case-stage-id> derived from the stage's plain name.",
        "- per-size tabs: SIZE:Fr<number>.",
        "",
        "Concepts:", concepts, "",
        "Workbook structure:", structure, "",
        "Resolve these entities (return one mapping per entityId, confidence 0..1):", targets,
      ].join("\n"),
    }),
  );

  const out = new Map<string, { canonical: string; kind: MappingProposalT["kind"]; confidence: number; reason: string }>();
  for (const m of object.mappings) {
    if (m.canonical) out.set(m.entityId, { canonical: m.canonical, kind: m.kind, confidence: Math.max(0, Math.min(1, m.confidence)), reason: `LLM: ${m.reason}` });
  }
  return out;
}

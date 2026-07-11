// src/core/ontology/builder/learn.ts
// Verified MOD → company knowledge. Runs at publish time only — rung 6 is the
// sole writer of knowledge (ADD §11: the user verifies, the system learns).

import type { ModRowT } from "@/shared/models/ontology";
import { getKnowledgeStore, normalizeKey, type KnowledgeEntry } from "@/core/ontology/store/knowledge-store";

const SIZE_SHEET_RE = /^\d+\s*FR\.?\s*$/i;

export function knowledgeFromMod(mod: ModRowT): Omit<KnowledgeEntry, "learnedAt" | "useCount">[] {
  const out: Omit<KnowledgeEntry, "learnedAt" | "useCount">[] = [];
  const seen = new Set<string>();
  const push = (e: Omit<KnowledgeEntry, "learnedAt" | "useCount">) => {
    const k = `${e.kind}|${e.key}`;
    if (!seen.has(k)) { seen.add(k); out.push(e); }
  };

  for (const e of mod.document.entities) {
    if (!e.verified || !e.canonical) continue;

    if (e.kind === "stage") {
      // A size tab ("16FR") must never become a stage alias — it would poison
      // every other size-wise workbook. The FILE name carries the stage there.
      // Otherwise the entity's header IS the learnable label: the region label
      // ("VALVE INTEGRITY") on multi-table sheets, the sheet name elsewhere.
      const key = SIZE_SHEET_RE.test(e.original.sheet)
        ? normalizeKey(mod.document.workbook.fileName)
        : normalizeKey(e.original.header);
      push({ companyId: mod.companyId, kind: "stage-alias", key, canonicalId: e.canonical, confidence: 1, learnedFrom: mod.modId });
    } else if (e.original.colLetter !== null) {
      // Every verified column mapping (measures, defects, dimensions, dates).
      push({ companyId: mod.companyId, kind: "column-mapping", key: normalizeKey(e.original.header), canonicalId: e.canonical, confidence: 1, learnedFrom: mod.modId });
    }
  }
  return out;
}

export async function learnFromMod(mod: ModRowT): Promise<number> {
  const entries = knowledgeFromMod(mod);
  await getKnowledgeStore().learn(entries);
  return entries.length;
}

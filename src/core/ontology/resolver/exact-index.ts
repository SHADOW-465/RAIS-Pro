// src/core/ontology/resolver/exact-index.ts
// Rung 1 corpus: every verified mapping across the company's verified MODs,
// keyed by normalized verbatim label. First verification wins on collisions.

import { getModStore } from "@/core/ontology/store/mod-store";
import { normalizeKey } from "@/core/ontology/store/knowledge-store";
import type { ExactIndex } from "./ladder";

export async function buildExactIndex(companyId: string): Promise<ExactIndex> {
  const rows = await getModStore().verified(companyId);
  const index: ExactIndex = new Map();
  for (const row of rows) {
    for (const e of row.document.entities) {
      if (!e.verified || !e.canonical) continue;
      const key = `${e.kind === "stage" ? "stage" : "col"}|${normalizeKey(e.original.header)}`;
      if (!index.has(key)) index.set(key, { canonical: e.canonical, kind: e.kind });
    }
  }
  return index;
}

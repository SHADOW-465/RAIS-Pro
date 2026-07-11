// src/core/ontology/validate/mod-validator.ts
// Internal-consistency gate for a ModDocument before it can be verified
// (ADD: "Only after this document is complete and internally consistent").

import type { ModDocumentT } from "@/shared/models/ontology";

export interface ModValidation {
  ok: boolean;
  errors: string[];
}

export function validateModDocument(doc: ModDocumentT): ModValidation {
  const errors: string[] = [];
  const sheetNames = new Set(doc.workbook.sheetNames);

  if (doc.entities.length === 0) errors.push("MOD has no entities — nothing was resolved.");

  const ids = new Set<string>();
  for (const e of doc.entities) {
    if (ids.has(e.entityId)) errors.push(`Duplicate entityId "${e.entityId}".`);
    ids.add(e.entityId);
    if (!sheetNames.has(e.original.sheet)) {
      errors.push(`Entity "${e.entityId}" references sheet "${e.original.sheet}" which is not in the workbook.`);
    }
  }

  const stageIds = new Set<string>();
  for (const s of doc.stages) {
    if (stageIds.has(s.stageId)) errors.push(`Duplicate stageId "${s.stageId}" in catalog.`);
    stageIds.add(s.stageId);
  }
  const defectCodes = new Set<string>();
  for (const d of doc.defects) {
    if (defectCodes.has(d.defectCode)) errors.push(`Duplicate defectCode "${d.defectCode}" in catalog.`);
    defectCodes.add(d.defectCode);
    for (const st of d.stages) {
      if (!stageIds.has(st)) errors.push(`Defect "${d.defectCode}" references unknown stage "${st}".`);
    }
  }

  for (const r of doc.relationships) {
    const fromOk = ids.has(r.from) || sheetNames.has(r.from);
    if (!fromOk) errors.push(`Relationship ${r.kind} references unknown source "${r.from}".`);
  }

  for (const l of doc.layout) {
    if (!sheetNames.has(l.sheet)) errors.push(`Layout references unknown sheet "${l.sheet}".`);
    for (const id of l.columnOrder) {
      if (!ids.has(id)) errors.push(`Layout for "${l.sheet}" orders unknown entity "${id}".`);
    }
  }

  return { ok: errors.length === 0, errors };
}

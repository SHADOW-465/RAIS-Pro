// scripts/migrate-presets-to-mods.ts
// One-shot, idempotent Phase 4 migration (MOD-MIGRATION-PLAN §Phase 4):
//   1. every saved registry PRESET → a seeded VERIFIED MOD (synthetic snapshot
//      marked migrated:true) so the ontology catalogs replace the preset chain,
//   2. each preset's learned stageAliases → company_knowledge (stage-alias),
//   3. the hardcoded DISPOSAFE_REGISTRY → company knowledge (defect + stage
//      aliases) + a seed MOD — the same knowledge, demoted from code to data.
// Re-running skips lineages that already have a verified version and re-upserts
// knowledge (upserts are idempotent).
//
// Run: npx tsx scripts/migrate-presets-to-mods.ts

import { getStores } from "@/lib/store";
import { getModStore } from "@/core/ontology/store/mod-store";
import { getKnowledgeStore, normalizeKey, type KnowledgeEntry } from "@/core/ontology/store/knowledge-store";
import { getSnapshotStore } from "@/core/workbook/snapshot-store";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import { ModDocument, type ModDocumentT, type ModEntityT } from "@/shared/models/ontology";
import type { z } from "zod";
import type { ClientRegistry } from "@/lib/contract/d1";

type Registry = z.infer<typeof ClientRegistry>;
type KnowledgeSeed = Omit<KnowledgeEntry, "learnedAt" | "useCount">;

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

async function sha256Hex(s: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Best-effort mapping of a preset field name to a canonical capture. */
function captureOf(fieldName: string): "checked" | "accepted" | "hold" | "rejected" | null {
  const f = fieldName.toLowerCase();
  if (/check|input|\brec\b|receiv/.test(f)) return "checked";
  if (/good|accept|pass|\bok\b/.test(f)) return "accepted";
  if (/rework|hold/.test(f)) return "hold";
  if (/reject|\brej\b/.test(f)) return "rejected";
  return null;
}

/** Registry (preset row or DISPOSAFE constant) → verified-shape ModDocument. */
function documentFromRegistry(company: string, sourceName: string, reg: {
  fiscalYearStartMonth: number;
  stages: any[]; defects: any[]; sizes: any[];
}): ModDocumentT {
  const sheetNames = reg.stages.map((s: any) => s.label ?? s.stageId);
  const entities: ModEntityT[] = reg.stages.map((s: any) => ({
    entityId: `stage:${s.stageId}`,
    kind: "stage" as const,
    original: { sheet: s.label ?? s.stageId, tableId: "t1", colLetter: null, header: s.label ?? s.stageId },
    canonical: `STAGE:${s.stageId}`,
    subcategory: null,
    confidence: 1,
    resolvedBy: "user" as const,
    reason: `migrated from ${sourceName}`,
    verified: true,
  }));

  const stages = reg.stages.map((s: any) => ({
    stageId: s.stageId,
    label: s.label ?? s.stageId,
    effectiveFrom: s.effectiveFrom ?? null,
    effectiveTo: s.effectiveTo ?? null,
    upstream: s.upstream ?? [],
    sizeWise: s.sizeWise ?? false,
    // Preset stages carry ad-hoc `fields`; DISPOSAFE stages carry `captures`.
    captures: s.captures ?? (s.fields ?? [])
      .map((f: any) => captureOf(f.name ?? ""))
      .filter((c: unknown, i: number, arr: unknown[]) => c !== null && arr.indexOf(c) === i),
    isQualityGate: s.isQualityGate ?? ((s.captures ?? s.fields ?? []).length > 0 &&
      (s.captures?.includes("rejected") ?? (s.fields ?? []).some((f: any) => captureOf(f.name ?? "") === "rejected"))),
  }));

  const defects = (reg.defects ?? []).map((d: any) => ({
    defectCode: d.defectCode, label: d.label,
    aliases: d.aliases?.length ? d.aliases : [d.label ?? d.defectCode],
    stages: (d.stages ?? []).filter((st: string) => stages.some((s: any) => s.stageId === st)),
  }));

  // Layout preserved from schema-extractor presets when present (header rows +
  // merges reproduce the company's own sheet in generated data entry).
  const layout = reg.stages
    .filter((s: any) => s.headerRows || s.merges)
    .map((s: any) => ({
      sheet: s.label ?? s.stageId,
      tableId: "t1",
      headerRows: (s.headerRows ?? []).map((row: any[]) => row.map((c) => (typeof c === "string" || typeof c === "number" ? c : null))),
      merges: (s.merges ?? []).map((m: any) => ({ s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } })),
      columnOrder: [],
    }));

  return ModDocument.parse({
    companyId: company,
    workbook: { fileName: sourceName, fileHash: "migrated", sheetNames },
    entities,
    stages,
    defects,
    sizes: reg.sizes ?? [],
    fiscalYearStartMonth: reg.fiscalYearStartMonth ?? 4,
    relationships: entities.map((e) => ({ kind: "sheet-represents-stage" as const, from: e.original.sheet, to: e.canonical! })),
    formulas: [],
    layout,
    validation: [
      { ruleId: "V-BAL-1", expr: "CHECKED_QTY >= REJECTED_QTY", severity: "warning" as const },
    ],
  });
}

/** Alias knowledge from a registry's defect catalog + stage labels. */
function knowledgeFromRegistry(company: string, sourceName: string, reg: Pick<Registry, "stages" | "defects">): KnowledgeSeed[] {
  const out: KnowledgeSeed[] = [];
  for (const s of reg.stages) {
    out.push({ companyId: company, kind: "stage-alias", key: normalizeKey(s.label), canonicalId: `STAGE:${s.stageId}`, confidence: 1, learnedFrom: sourceName });
  }
  for (const d of reg.defects) {
    for (const alias of d.aliases) {
      out.push({ companyId: company, kind: "column-mapping", key: normalizeKey(alias), canonicalId: `DEFECT:${d.defectCode}`, confidence: 1, learnedFrom: sourceName });
    }
  }
  return out;
}

export async function migrate(): Promise<{ mods: number; skipped: number; knowledge: number }> {
  const company = companyId();
  const modStore = getModStore();
  const knowledgeStore = getKnowledgeStore();
  const snapshotStore = getSnapshotStore();
  const { registries } = getStores();

  let mods = 0, skipped = 0, knowledge = 0;

  const seedOne = async (sourceName: string, reg: any, aliasSeeds: KnowledgeSeed[]) => {
    const modId = await sha256Hex(`migrated:${company}:${sourceName}`);
    if (await modStore.activeFor(modId)) {
      skipped++;
    } else {
      // Synthetic snapshot: presets never stored raw workbooks losslessly.
      // Re-uploading the original file later creates a REAL lineage; this one
      // exists so catalogs/templates work from day one.
      await snapshotStore.put({ snapshotId: modId, fileName: `${sourceName} (migrated)`, sheets: [] });
      const document = documentFromRegistry(company, sourceName, reg);
      const draft = await modStore.saveDraft({ modId, companyId: company, snapshotId: modId, document });
      await modStore.publish(modId, draft.version, "migration:presets-to-mods");
      mods++;
    }
    await knowledgeStore.learn(aliasSeeds);
    knowledge += aliasSeeds.length;
  };

  // 1+2: every saved preset (+ its learned stageAliases).
  for (const summary of await registries.list()) {
    const row = await registries.get(summary.presetId);
    if (!row) continue;
    const aliasSeeds: KnowledgeSeed[] = Object.entries(row.stageAliases ?? {}).map(([key, a]) => ({
      companyId: company, kind: "stage-alias", key, canonicalId: `STAGE:${a.stageId}`, confidence: a.confidence, learnedFrom: `preset:${row.presetId}`,
    }));
    await seedOne(`preset:${row.presetId}`, row, [
      ...aliasSeeds,
      ...knowledgeFromRegistry(company, `preset:${row.presetId}`, { stages: row.stages as any, defects: (row.defects ?? []) as any }),
    ]);
  }

  // 3: the hardcoded Disposafe registry — demoted from code to data.
  await seedOne("disposafe-registry", DISPOSAFE_REGISTRY,
    knowledgeFromRegistry(company, "disposafe-registry", DISPOSAFE_REGISTRY));

  return { mods, skipped, knowledge };
}

// CLI entry — `npx tsx scripts/migrate-presets-to-mods.ts`
if (require.main === module) {
  migrate()
    .then((r) => {
      console.log(`Migrated ${r.mods} registr${r.mods === 1 ? "y" : "ies"} to verified MODs (${r.skipped} already migrated); upserted ${r.knowledge} knowledge entries.`);
      process.exit(0);
    })
    .catch((e) => { console.error("Migration failed:", e); process.exit(1); });
}

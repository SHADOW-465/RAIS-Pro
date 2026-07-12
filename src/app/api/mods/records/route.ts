// src/app/api/mods/records/route.ts
// POST {modId} → StageDayRecords extracted from the lineage's VERIFIED MOD and
// its lossless snapshot (Phase 5 staging flow: verify → publish → extract →
// review grid → /api/ingest). Extraction never runs against a draft.

import { NextRequest, NextResponse } from "next/server";
import { getModStore } from "@/core/ontology/store/mod-store";
import { getSnapshotStore } from "@/core/workbook/snapshot-store";
import { extractFromMod } from "@/core/ingest/extract-from-mod";

export async function POST(req: NextRequest) {
  try {
    const { modId, ingestionId } = await req.json();
    if (!modId) return NextResponse.json({ error: "modId is required" }, { status: 400 });

    const mod = await getModStore().activeFor(modId);
    if (!mod) return NextResponse.json({ error: `No verified MOD for lineage ${modId}` }, { status: 404 });

    const snapshot = await getSnapshotStore().get(mod.snapshotId);
    if (!snapshot) return NextResponse.json({ error: `Snapshot ${mod.snapshotId} not found` }, { status: 404 });

    const records = extractFromMod(
      mod.document,
      snapshot,
      ingestionId || `mod-${modId.slice(0, 8)}-${Date.now()}`,
      { modId: mod.modId, modVersion: mod.version },
    );
    return NextResponse.json({ records, modId: mod.modId, modVersion: mod.version });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Extraction failed" }, { status: 500 });
  }
}

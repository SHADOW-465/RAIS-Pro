// src/app/api/workbooks/route.ts
// MOD pipeline entry (ADD §9): upload → lossless snapshot → profile → resolve
// → draft MOD + proposals. Nothing here writes events or knowledge — the draft
// waits for human verification (/api/mods/verify) and publication (/api/mods).

import { NextRequest, NextResponse } from "next/server";
import { readWorkbookSnapshot } from "@/core/workbook/reader";
import { getSnapshotStore } from "@/core/workbook/snapshot-store";
import { buildProfilingTables } from "@/core/profiler/from-workbook";
import { profileTable } from "@/core/profiler/profile";
import { resolveWorkbook, type ResolverSheet } from "@/core/ontology/resolver/ladder";
import { buildExactIndex } from "@/core/ontology/resolver/exact-index";
import { llmResolve } from "@/core/ontology/resolver/llm";
import { buildModDocument, type ProfiledSheet } from "@/core/ontology/builder/build-mod";
import { getModStore } from "@/core/ontology/store/mod-store";
import { getKnowledgeStore } from "@/core/ontology/store/knowledge-store";
import { availableBackends } from "@/lib/ai";

export const runtime = "nodejs";

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

/** GET /api/workbooks — uploaded snapshots joined with their MOD lineage
 *  (the Workbooks explorer's data source; replaces /api/datasets). */
export async function GET() {
  try {
    const [snapshots, mods] = await Promise.all([
      getSnapshotStore().list(),
      getModStore().list(companyId()),
    ]);
    const latestByLineage = new Map<string, (typeof mods)[number]>();
    for (const m of mods) {
      const cur = latestByLineage.get(m.modId);
      if (!cur || m.version > cur.version) latestByLineage.set(m.modId, m);
    }
    const workbooks = snapshots.map((s) => ({
      ...s,
      mod: latestByLineage.get(s.snapshotId) ?? null, // lineage id = first snapshot hash
    }));
    return NextResponse.json({ workbooks });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to list workbooks" }, { status: 500 });
  }
}

/** DELETE /api/workbooks?snapshotId=... — remove an uploaded file from the
 *  Workbooks explorer (the snapshot + its MOD lineage). Ledger events already
 *  emitted from a verified version are append-only and are left alone. */
export async function DELETE(req: NextRequest) {
  const snapshotId = req.nextUrl.searchParams.get("snapshotId");
  if (!snapshotId) {
    return NextResponse.json({ error: "snapshotId is required" }, { status: 400 });
  }
  try {
    await Promise.all([
      getSnapshotStore().delete(snapshotId),
      getModStore().deleteLineage(snapshotId), // lineage id = first snapshot hash
    ]);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete workbook" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
    }
    const useLlm = form.get("llm") !== "off" && availableBackends().length > 0;

    const company = companyId();
    const [exact, concepts] = await Promise.all([
      buildExactIndex(company),
      getKnowledgeStore().concepts(),
    ]);

    const mods = [];
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const snapshot = await readWorkbookSnapshot(buf, file.name);
      await getSnapshotStore().put(snapshot);

      const sheets: ProfiledSheet[] = buildProfilingTables(buf, file.name).map((table) => ({
        table,
        columns: profileTable(table).columns,
      }));
      const resolverSheets: ResolverSheet[] = sheets.map((s) => ({
        fileName: file.name,
        sheetName: s.table.sheetName,
        tableId: s.table.tableId,
        regionLabel: s.table.regionLabel,
        columns: s.columns,
      }));

      const proposals = await resolveWorkbook(resolverSheets, {
        companyId: company,
        exact,
        knowledge: getKnowledgeStore(),
        concepts,
        llm: useLlm ? llmResolve : undefined,
      });

      const document = buildModDocument({ companyId: company, snapshot, sheets, proposals });
      const draft = await getModStore().saveDraft({
        modId: snapshot.snapshotId,
        companyId: company,
        snapshotId: snapshot.snapshotId,
        document,
      });

      mods.push({
        modId: draft.modId,
        version: draft.version,
        fileName: file.name,
        snapshotId: snapshot.snapshotId,
        proposals,
        stages: document.stages,
        defects: document.defects,
        sizes: document.sizes,
      });
    }

    return NextResponse.json({ mods, llmUsed: useLlm });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Workbook processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

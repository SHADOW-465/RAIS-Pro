// src/app/api/registry-alias/route.ts
// Alias write path (Task 6): persists a user-confirmed sheet/file-name -> stage
// mapping onto the preset's RegistryRow.stageAliases, so future uploads of the
// same sheet name auto-recognize without re-asking (MOID-SPEC entity-resolution
// plan, Task 5/6).

import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import { normalizeAliasKey } from "@/lib/dataset/recognize";

interface AliasBody {
  presetId: string;
  sheetName: string;
  stageId: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<AliasBody>;
    if (!body.presetId || !body.sheetName || !body.stageId) {
      return NextResponse.json({ error: "presetId, sheetName, and stageId are required" }, { status: 400 });
    }

    const { registries } = getStores();
    const row = await registries.get(body.presetId);
    if (!row) {
      return NextResponse.json({ error: `No registry preset '${body.presetId}'` }, { status: 404 });
    }

    const key = normalizeAliasKey(body.sheetName);
    const updated = {
      ...row,
      stageAliases: {
        ...row.stageAliases,
        [key]: {
          stageId: body.stageId,
          confidence: 1,
          basis: "alias" as const,
          learnedAt: new Date().toISOString(),
        },
      },
    };
    await registries.upsert(updated);

    return NextResponse.json({ ok: true, key });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to save alias" }, { status: 500 });
  }
}

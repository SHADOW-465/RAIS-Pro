// src/app/api/mods/verify/route.ts
// Rung 6: apply user verification decisions to a DRAFT MOD's entities and
// re-derive its catalogs. The LLM/heuristics proposed; only this route (and
// the publish that follows) makes a mapping real.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { VerificationDecision } from "@/shared/models/entities";
import { getModStore } from "@/core/ontology/store/mod-store";
import { deriveCatalogs } from "@/core/ontology/builder/build-mod";

const Body = z.object({
  modId: z.string().min(1),
  version: z.number().int().min(1),
  decisions: z.array(VerificationDecision).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 400 });
    }
    const { modId, version, decisions } = parsed.data;

    const store = getModStore();
    const row = await store.get(modId, version);
    if (!row) return NextResponse.json({ error: `No MOD ${modId} v${version}` }, { status: 404 });
    if (row.status !== "draft") {
      return NextResponse.json({ error: `MOD ${modId} v${version} is ${row.status}, not draft` }, { status: 409 });
    }

    const byId = new Map(decisions.map((d) => [d.entityId, d]));
    const unknown = decisions.filter((d) => !row.document.entities.some((e) => e.entityId === d.entityId));
    if (unknown.length > 0) {
      return NextResponse.json({ error: `Unknown entityIds: ${unknown.map((d) => d.entityId).join(", ")}` }, { status: 400 });
    }

    const entities = row.document.entities.map((e) => {
      const d = byId.get(e.entityId);
      if (!d) return e;
      if (d.action === "accept") {
        return { ...e, verified: true };
      }
      // override: the user names the canonical (null = "this maps to nothing").
      return {
        ...e,
        canonical: d.canonical,
        kind: d.kind ?? e.kind,
        confidence: 1,
        resolvedBy: "user" as const,
        reason: d.comment?.trim() ? `user override: ${d.comment.trim()}` : "user override",
        verified: true,
      };
    });

    const document = { ...row.document, entities, ...deriveCatalogs(entities) };
    const saved = await store.updateDraft(modId, version, document);

    return NextResponse.json({
      modId: saved.modId,
      version: saved.version,
      verifiedCount: entities.filter((e) => e.verified).length,
      totalEntities: entities.length,
      stages: document.stages,
      defects: document.defects,
      sizes: document.sizes,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Verification failed" }, { status: 500 });
  }
}

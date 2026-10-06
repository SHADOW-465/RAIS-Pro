// src/app/api/mods/route.ts
//   GET  /api/mods                     → list (company scope)
//   GET  /api/mods?modId=X[&version=N] → one MOD row
//   POST /api/mods {modId, version, verifiedBy?} → publish a draft (validator-
//        gated), supersede the prior verified version, learn into knowledge.

import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guard";
import { getModStore } from "@/core/ontology/store/mod-store";
import { getCatalogStore } from "@/core/ontology/store/catalog-store";
import { validateModDocument } from "@/core/ontology/validate/mod-validator";
import { learnFromMod } from "@/core/ontology/builder/learn";
import { LIVE_CACHE } from "@/lib/http/live-cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const modId = req.nextUrl.searchParams.get("modId");
    if (modId) {
      const versionParam = req.nextUrl.searchParams.get("version");
      const row = await getModStore().get(modId, versionParam ? Number(versionParam) : undefined);
      if (!row) return NextResponse.json({ error: `No MOD ${modId}` }, { status: 404 });
      return NextResponse.json({ mod: row }, { headers: LIVE_CACHE });
    }
    const company = process.env.MOID_COMPANY_ID || "default";
    return NextResponse.json({ mods: await getModStore().list(company) }, { headers: LIVE_CACHE });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load MODs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCapability(req, "write");
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { modId, version, verifiedBy, acceptNovel } = body ?? {};
    if (!modId || typeof version !== "number") {
      return NextResponse.json({ error: "modId and version are required" }, { status: 400 });
    }

    const store = getModStore();
    const row = await store.get(modId, version);
    if (!row) return NextResponse.json({ error: `No MOD ${modId} v${version}` }, { status: 404 });
    if (row.status !== "draft") {
      return NextResponse.json({ error: `MOD ${modId} v${version} is ${row.status}, not draft` }, { status: 409 });
    }

    const check = validateModDocument(row.document);
    if (!check.ok) {
      return NextResponse.json({ error: "MOD is not internally consistent", details: check.errors }, { status: 422 });
    }

    const published = await store.publish(modId, version, verifiedBy || "steward");
    // Plant schema is master. When already configured, only add entities the
    // operator explicitly accepted as novel (acceptNovel). Matching existing
    // codes still unions aliases. Empty plant → full bootstrap merge.
    const catalog = await getCatalogStore().mergeFromMod(published, {
      acceptNovel: acceptNovel ?? null,
    });
    const learned = await learnFromMod(published);
    return NextResponse.json({
      modId: published.modId,
      version: published.version,
      status: published.status,
      supersedes: published.supersedes,
      learnedMappings: learned,
      catalogCounts: {
        stages: catalog.stages.length,
        defects: catalog.defects.length,
        sizes: catalog.sizes.length,
      },
      catalogUpdatedAt: catalog.updatedAt,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to publish MOD" }, { status: 500 });
  }
}

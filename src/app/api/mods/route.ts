// src/app/api/mods/route.ts
//   GET  /api/mods                     → list (company scope)
//   GET  /api/mods?modId=X[&version=N] → one MOD row
//   POST /api/mods {modId, version, verifiedBy?} → publish a draft (validator-
//        gated), supersede the prior verified version, learn into knowledge.

import { NextRequest, NextResponse } from "next/server";
import { getModStore } from "@/core/ontology/store/mod-store";
import { validateModDocument } from "@/core/ontology/validate/mod-validator";
import { learnFromMod } from "@/core/ontology/builder/learn";

export async function GET(req: NextRequest) {
  try {
    const modId = req.nextUrl.searchParams.get("modId");
    if (modId) {
      const versionParam = req.nextUrl.searchParams.get("version");
      const row = await getModStore().get(modId, versionParam ? Number(versionParam) : undefined);
      if (!row) return NextResponse.json({ error: `No MOD ${modId}` }, { status: 404 });
      return NextResponse.json({ mod: row });
    }
    const company = process.env.MOID_COMPANY_ID || "default";
    return NextResponse.json({ mods: await getModStore().list(company) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load MODs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { modId, version, verifiedBy } = body ?? {};
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
    const learned = await learnFromMod(published);
    return NextResponse.json({
      modId: published.modId,
      version: published.version,
      status: published.status,
      supersedes: published.supersedes,
      learnedMappings: learned,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to publish MOD" }, { status: 500 });
  }
}

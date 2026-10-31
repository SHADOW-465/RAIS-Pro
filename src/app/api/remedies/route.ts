// Plant defect remedies. Migration is a file only — a missing table is 503.
// The browser keeps its local book and shows that message.

import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import {
  getRemedyStore,
  type RemedyBookRow,
  type RemedyRead,
  type RemedyRow,
  type TrendNoteRow,
} from "@/lib/remedies/store";
import { LIVE_CACHE, withNoStore } from "@/lib/http/live-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

const REMEDY_UNAVAILABLE =
  "Defect remedies are not set up. Apply supabase/migrations/20261013_defect_remedies.sql, then reload.";

function remedyJson(read: RemedyRead, headers?: HeadersInit) {
  if (read.source !== "db") {
    console.warn(REMEDY_UNAVAILABLE);
    return NextResponse.json(
      { error: REMEDY_UNAVAILABLE, source: "unavailable", book: read.book },
      { status: 503, headers },
    );
  }
  return NextResponse.json(read, { headers });
}

function asBook(body: unknown): RemedyBookRow {
  const v = (body ?? {}) as { defects?: Record<string, RemedyRow>; trends?: TrendNoteRow[] };
  const defects: RemedyBookRow["defects"] = {};
  if (v.defects && typeof v.defects === "object") {
    for (const [code, row] of Object.entries(v.defects)) {
      if (!row || typeof row !== "object") continue;
      defects[code] = {
        code,
        description: String(row.description ?? ""),
        remedy: String(row.remedy ?? ""),
        updatedAt: String(row.updatedAt ?? new Date().toISOString()),
        updatedBy: String(row.updatedBy ?? ""),
      };
    }
  }
  const trends = Array.isArray(v.trends)
    ? v.trends.filter((t) => t && typeof t.id === "string").map((t) => ({
        id: t.id,
        kind: t.kind === "dip" ? "dip" as const : "spike" as const,
        graph: String(t.graph ?? ""),
        period: String(t.period ?? ""),
        description: String(t.description ?? ""),
        remedy: String(t.remedy ?? ""),
        updatedAt: String(t.updatedAt ?? new Date().toISOString()),
        updatedBy: String(t.updatedBy ?? ""),
      }))
    : [];
  return { defects, trends };
}

async function getHandler(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  try {
    const read = await getRemedyStore().read(companyId());
    return remedyJson(read, LIVE_CACHE);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to read remedies" },
      { status: 500, headers: LIVE_CACHE },
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireCapability(req, "configure");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const store = getRemedyStore();
    const company = companyId();
    const actor = auth.actor.username;
    const now = new Date().toISOString();

    if (body?.importLocal) {
      const read = await store.importIfEmpty(company, asBook(body.book));
      return remedyJson(read);
    }
    if (body?.removeTrendId && typeof body.removeTrendId === "string") {
      const read = await store.removeTrend(company, body.removeTrendId);
      return remedyJson(read);
    }
    if (body?.trend && typeof body.trend === "object") {
      const t = body.trend as Partial<TrendNoteRow>;
      const row: TrendNoteRow = {
        id: typeof t.id === "string" && t.id ? t.id : `tn-${Date.now().toString(36)}`,
        kind: t.kind === "dip" ? "dip" : "spike",
        graph: String(t.graph ?? "").trim(),
        period: String(t.period ?? "").trim(),
        description: String(t.description ?? "").trim(),
        remedy: String(t.remedy ?? "").trim(),
        updatedAt: now,
        updatedBy: actor,
      };
      const read = await store.saveTrend(company, row);
      return remedyJson(read);
    }
    const code = String(body?.code ?? body?.defect?.code ?? "").trim();
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
    const fields = (body?.defect ?? body) as { description?: string; remedy?: string };
    const row: RemedyRow = {
      code,
      description: String(fields.description ?? "").trim(),
      remedy: String(fields.remedy ?? "").trim(),
      updatedAt: now,
      updatedBy: actor,
    };
    const read = await store.saveDefect(company, row);
    return remedyJson(read);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save remedy" },
      { status: 500 },
    );
  }
}

export const GET = withNoStore(getHandler);

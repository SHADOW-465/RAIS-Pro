// Plant defect remedies. Writes are authorized from the session, never the body.
// A missing table is 503 — the browser must not treat that as a successful save.

import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/auth/guard";
import { catalogLabelFor, resolveRemedyKey } from "@/lib/remedies/identity";
import {
  getRemedyStore,
  RemedyConflictError,
  RemedyUnavailableError,
  type RemedyBookRow,
  type RemedyRow,
  type TrendNoteRow,
} from "@/lib/remedies/store";
import { LIVE_CACHE } from "@/lib/http/live-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

function asBook(body: unknown): RemedyBookRow {
  const v = (body ?? {}) as { defects?: Record<string, Partial<RemedyRow>>; trends?: Partial<TrendNoteRow>[] };
  const defects: RemedyBookRow["defects"] = {};
  if (v.defects && typeof v.defects === "object") {
    for (const [code, row] of Object.entries(v.defects)) {
      if (!row || typeof row !== "object") continue;
      const key = resolveRemedyKey(String(row.code ?? code));
      if (!key) continue;
      const now = String(row.updatedAt ?? new Date().toISOString());
      const actor = String(row.updatedBy ?? "");
      defects[key] = {
        code: key,
        defectName: String(row.defectName ?? "") || catalogLabelFor(key),
        description: String(row.description ?? ""),
        remedy: String(row.remedy ?? ""),
        createdAt: String(row.createdAt ?? now),
        createdBy: String(row.createdBy ?? actor),
        updatedAt: now,
        updatedBy: actor,
        version: Number(row.version) > 0 ? Number(row.version) : 1,
      };
    }
  }
  const trends = Array.isArray(v.trends)
    ? v.trends
        .filter((t) => t && typeof t.id === "string")
        .map((t) => {
          const now = String(t.updatedAt ?? new Date().toISOString());
          const actor = String(t.updatedBy ?? "");
          return {
            id: t.id as string,
            kind: t.kind === "dip" ? ("dip" as const) : ("spike" as const),
            graph: String(t.graph ?? ""),
            period: String(t.period ?? ""),
            description: String(t.description ?? ""),
            remedy: String(t.remedy ?? ""),
            createdAt: String(t.createdAt ?? now),
            createdBy: String(t.createdBy ?? actor),
            updatedAt: now,
            updatedBy: actor,
            version: Number(t.version) > 0 ? Number(t.version) : 1,
          };
        })
    : [];
  return { defects, trends };
}

function fail(err: unknown) {
  if (err instanceof RemedyConflictError) {
    return NextResponse.json(
      { error: err.message, source: "db", book: err.current.book, conflict: true },
      { status: 409, headers: LIVE_CACHE },
    );
  }
  if (err instanceof RemedyUnavailableError) {
    return NextResponse.json(
      { source: "unavailable", book: { defects: {}, trends: [] }, error: err.message },
      { status: 503, headers: LIVE_CACHE },
    );
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Failed to save remedy" },
    { status: 500, headers: LIVE_CACHE },
  );
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  try {
    const read = await getRemedyStore().read(companyId());
    if (read.source !== "db") {
      return NextResponse.json(read, { status: 503, headers: LIVE_CACHE });
    }
    return NextResponse.json(read, { headers: LIVE_CACHE });
  } catch (err: unknown) {
    return fail(err);
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
      const incoming = asBook(body.book);
      for (const row of Object.values(incoming.defects)) {
        row.updatedBy = actor;
        row.createdBy = actor;
        row.updatedAt = now;
      }
      for (const row of incoming.trends) {
        row.updatedBy = actor;
        row.createdBy = actor;
        row.updatedAt = now;
      }
      const read = await store.importIfEmpty(company, incoming);
      if (read.source !== "db") throw new RemedyUnavailableError(read.error);
      return NextResponse.json(read, { headers: LIVE_CACHE });
    }
    if (body?.removeTrendId && typeof body.removeTrendId === "string") {
      const read = await store.removeTrend(company, body.removeTrendId);
      if (read.source !== "db") throw new RemedyUnavailableError(read.error);
      return NextResponse.json(read, { headers: LIVE_CACHE });
    }
    if (body?.trend && typeof body.trend === "object") {
      const t = body.trend as Partial<TrendNoteRow>;
      const description = String(t.description ?? "").trim();
      const remedy = String(t.remedy ?? "").trim();
      if (!description || !remedy) {
        return NextResponse.json({ error: "Trend description and remedy are required." }, { status: 400 });
      }
      const row: TrendNoteRow = {
        id: typeof t.id === "string" && t.id ? t.id : `tn-${Date.now().toString(36)}`,
        kind: t.kind === "dip" ? "dip" : "spike",
        graph: String(t.graph ?? "").trim(),
        period: String(t.period ?? "").trim(),
        description,
        remedy,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
        version: 1,
      };
      const read = await store.saveTrend(company, row);
      if (read.source !== "db") throw new RemedyUnavailableError(read.error);
      return NextResponse.json(read, { headers: LIVE_CACHE });
    }

    const code = resolveRemedyKey(String(body?.code ?? body?.defect?.code ?? ""));
    if (!code) return NextResponse.json({ error: "A defect code is required." }, { status: 400 });
    const fields = (body?.defect ?? body) as { description?: string; remedy?: string; version?: number };
    const description = String(fields.description ?? "").trim();
    const remedy = String(fields.remedy ?? "").trim();
    if (!description || !remedy) {
      return NextResponse.json({ error: "Explanatory description and remedy are both required." }, { status: 400 });
    }
    const expectedVersion =
      typeof fields.version === "number" && Number.isFinite(fields.version) ? fields.version : null;
    const row: RemedyRow = {
      code,
      defectName: catalogLabelFor(code),
      description,
      remedy,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
      version: 1,
    };
    const read = await store.saveDefect(company, row, expectedVersion);
    if (read.source !== "db") throw new RemedyUnavailableError(read.error);
    return NextResponse.json(read, { headers: LIVE_CACHE });
  } catch (err: unknown) {
    return fail(err);
  }
}

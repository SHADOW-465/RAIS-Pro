// Plant defect-remedy book.
// Memory when MOID_STORE=memory. Supabase otherwise.
// A missing table is "unavailable" — the client must not pretend the write
// landed in the plant book.

import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";
import { catalogLabelFor, resolveRemedyKey, validatedDefects } from "./identity";

export interface RemedyRow {
  code: string;
  defectName: string;
  description: string;
  remedy: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

export interface TrendNoteRow {
  id: string;
  kind: "spike" | "dip";
  graph: string;
  period: string;
  description: string;
  remedy: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

export interface RemedyBookRow {
  defects: Record<string, RemedyRow>;
  trends: TrendNoteRow[];
}

export type RemedyRead = { source: "db" | "unavailable"; book: RemedyBookRow; error?: string };

const EMPTY: RemedyBookRow = { defects: {}, trends: [] };

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

export class RemedyConflictError extends Error {
  readonly status = 409;
  constructor(public current: RemedyRead) {
    super("This remedy was updated by someone else. Reload and try again.");
    this.name = "RemedyConflictError";
  }
}

export class RemedyUnavailableError extends Error {
  readonly status = 503;
  constructor(message = "Plant remedy tables are not available. Apply supabase/migrations/20261013_defect_remedies.sql.") {
    super(message);
    this.name = "RemedyUnavailableError";
  }
}

export interface RemedyStore {
  read(company?: string): Promise<RemedyRead>;
  saveDefect(company: string, row: RemedyRow, expectedVersion?: number | null): Promise<RemedyRead>;
  saveTrend(company: string, row: TrendNoteRow): Promise<RemedyRead>;
  removeTrend(company: string, id: string): Promise<RemedyRead>;
  /** Write a browser book only when the plant book is still empty. */
  importIfEmpty(company: string, book: RemedyBookRow): Promise<RemedyRead>;
}

function stampNew(actor: string, now: string, version = 1): Pick<RemedyRow, "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "version"> {
  return { createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor, version };
}

function normalizeDefect(row: RemedyRow): RemedyRow {
  const code = resolveRemedyKey(row.code);
  return {
    ...row,
    code,
    defectName: row.defectName?.trim() || catalogLabelFor(code),
    description: row.description.trim(),
    remedy: row.remedy.trim(),
    version: Number.isFinite(row.version) && row.version > 0 ? row.version : 1,
  };
}

class MemoryRemedyStore implements RemedyStore {
  private byCompany = new Map<string, RemedyBookRow>();

  private book(company: string): RemedyBookRow {
    return this.byCompany.get(company) ?? { defects: {}, trends: [] };
  }

  async read(company = companyId()): Promise<RemedyRead> {
    return { source: "db", book: this.book(company) };
  }

  async saveDefect(company: string, row: RemedyRow, expectedVersion?: number | null): Promise<RemedyRead> {
    const nextRow = normalizeDefect(row);
    const book = this.book(company);
    const prev = book.defects[nextRow.code];
    if (expectedVersion != null && (prev?.version ?? 0) !== expectedVersion) {
      throw new RemedyConflictError({ source: "db", book });
    }
    const saved: RemedyRow = prev
      ? {
          ...nextRow,
          createdAt: prev.createdAt,
          createdBy: prev.createdBy,
          version: prev.version + 1,
        }
      : { ...nextRow, ...stampNew(nextRow.updatedBy, nextRow.updatedAt) };
    const next = { ...book, defects: { ...book.defects, [saved.code]: saved } };
    this.byCompany.set(company, next);
    return { source: "db", book: next };
  }

  async saveTrend(company: string, row: TrendNoteRow): Promise<RemedyRead> {
    const book = this.book(company);
    const prev = book.trends.find((t) => t.id === row.id);
    const saved: TrendNoteRow = prev
      ? { ...row, createdAt: prev.createdAt, createdBy: prev.createdBy, version: prev.version + 1 }
      : { ...row, ...stampNew(row.updatedBy, row.updatedAt) };
    const trends = [saved, ...book.trends.filter((t) => t.id !== saved.id)];
    const next = { ...book, trends };
    this.byCompany.set(company, next);
    return { source: "db", book: next };
  }

  async removeTrend(company: string, id: string): Promise<RemedyRead> {
    const book = this.book(company);
    const next = { ...book, trends: book.trends.filter((t) => t.id !== id) };
    this.byCompany.set(company, next);
    return { source: "db", book: next };
  }

  async importIfEmpty(company: string, incoming: RemedyBookRow): Promise<RemedyRead> {
    const book = this.book(company);
    const empty = Object.keys(book.defects).length === 0 && book.trends.length === 0;
    if (!empty) return { source: "db", book };
    const next = {
      defects: validatedDefects(incoming.defects),
      trends: [...incoming.trends],
    };
    this.byCompany.set(company, next);
    return { source: "db", book: next };
  }

  clear(): void {
    this.byCompany.clear();
  }
}

function missing(err: { code?: string; message?: string } | null, table: string): boolean {
  if (!err) return false;
  // PGRST204 = missing COLUMN. That still means the table exists.
  if (err.code === "PGRST204") return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const msg = err.message ?? "";
  if (/column/i.test(msg)) return false;
  return (
    msg.toLowerCase().includes(table) &&
    /does not exist|could not find the table|relation .* does not exist|schema cache/i.test(msg)
  );
}

function missingAuditColumn(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST204") return true;
  const msg = err.message ?? "";
  return (
    /defect_name|created_at|created_by|\bversion\b/.test(msg.toLowerCase()) &&
    /column|schema cache|does not exist|could not find/i.test(msg)
  );
}

function mapDefect(r: Record<string, unknown>): RemedyRow {
  const code = resolveRemedyKey(String(r.code ?? ""));
  return {
    code,
    defectName: String(r.defect_name ?? "") || catalogLabelFor(code),
    description: String(r.description ?? ""),
    remedy: String(r.remedy ?? ""),
    createdAt: String(r.created_at ?? r.updated_at ?? ""),
    createdBy: String(r.created_by ?? r.updated_by ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    updatedBy: String(r.updated_by ?? ""),
    version: Number(r.version) > 0 ? Number(r.version) : 1,
  };
}

function mapTrend(r: Record<string, unknown>): TrendNoteRow {
  return {
    id: String(r.id),
    kind: r.kind === "dip" ? "dip" : "spike",
    graph: String(r.graph ?? ""),
    period: String(r.period ?? ""),
    description: String(r.description ?? ""),
    remedy: String(r.remedy ?? ""),
    createdAt: String(r.created_at ?? r.updated_at ?? ""),
    createdBy: String(r.created_by ?? r.updated_by ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    updatedBy: String(r.updated_by ?? ""),
    version: Number(r.version) > 0 ? Number(r.version) : 1,
  };
}

class SupabaseRemedyStore implements RemedyStore {
  private db() {
    return createServerClient();
  }

  async read(company = companyId()): Promise<RemedyRead> {
    const db = this.db();
    const [defects, trends] = await Promise.all([
      db.from("defect_remedies").select("*").eq("company_id", company),
      db.from("defect_trend_notes").select("*").eq("company_id", company).order("updated_at", { ascending: false }),
    ]);
    if (missing(defects.error, "defect_remedies") || missing(trends.error, "defect_trend_notes")) {
      return {
        source: "unavailable",
        book: EMPTY,
        error: "Plant remedy tables are not available. Apply supabase/migrations/20261013_defect_remedies.sql.",
      };
    }
    if (defects.error) throw defects.error;
    if (trends.error) throw trends.error;
    const book: RemedyBookRow = { defects: {}, trends: [] };
    for (const r of defects.data ?? []) {
      const row = mapDefect(r as Record<string, unknown>);
      if (!row.code) continue;
      book.defects[row.code] = row;
    }
    for (const r of trends.data ?? []) {
      book.trends.push(mapTrend(r as Record<string, unknown>));
    }
    return { source: "db", book };
  }

  async saveDefect(company: string, row: RemedyRow, expectedVersion?: number | null): Promise<RemedyRead> {
    const nextRow = normalizeDefect(row);
    const db = this.db();
    const existing = await db
      .from("defect_remedies")
      .select("*")
      .eq("company_id", company)
      .eq("code", nextRow.code)
      .maybeSingle();
    if (missing(existing.error, "defect_remedies")) throw new RemedyUnavailableError();
    if (existing.error) throw existing.error;

    const prev = existing.data ? mapDefect(existing.data as Record<string, unknown>) : null;
    if (expectedVersion != null && (prev?.version ?? 0) !== expectedVersion) {
      throw new RemedyConflictError(await this.read(company));
    }

    const payload = {
      company_id: company,
      code: nextRow.code,
      defect_name: nextRow.defectName,
      description: nextRow.description,
      remedy: nextRow.remedy,
      created_at: prev?.createdAt ?? nextRow.updatedAt,
      created_by: prev?.createdBy ?? nextRow.updatedBy,
      updated_at: nextRow.updatedAt,
      updated_by: nextRow.updatedBy,
      version: prev ? prev.version + 1 : 1,
    };

    const { error } = await db.from("defect_remedies").upsert(payload, { onConflict: "company_id,code" });
    if (missing(error, "defect_remedies")) throw new RemedyUnavailableError();
    if (error && missingAuditColumn(error)) {
      const { error: legacyErr } = await db.from("defect_remedies").upsert(
        {
          company_id: company,
          code: nextRow.code,
          description: nextRow.description,
          remedy: nextRow.remedy,
          updated_at: nextRow.updatedAt,
          updated_by: nextRow.updatedBy,
        },
        { onConflict: "company_id,code" },
      );
      if (missing(legacyErr, "defect_remedies")) throw new RemedyUnavailableError();
      if (legacyErr) throw legacyErr;
      return this.read(company);
    }
    if (error) throw error;
    return this.read(company);
  }

  async saveTrend(company: string, row: TrendNoteRow): Promise<RemedyRead> {
    const db = this.db();
    const existing = await db.from("defect_trend_notes").select("*").eq("id", row.id).maybeSingle();
    if (missing(existing.error, "defect_trend_notes")) throw new RemedyUnavailableError();
    if (existing.error) throw existing.error;
    const prev = existing.data ? mapTrend(existing.data as Record<string, unknown>) : null;

    const payload = {
      id: row.id,
      company_id: company,
      kind: row.kind,
      graph: row.graph,
      period: row.period,
      description: row.description,
      remedy: row.remedy,
      created_at: prev?.createdAt ?? row.updatedAt,
      created_by: prev?.createdBy ?? row.updatedBy,
      updated_at: row.updatedAt,
      updated_by: row.updatedBy,
      version: prev ? prev.version + 1 : 1,
    };
    const { error } = await db.from("defect_trend_notes").upsert(payload, { onConflict: "id" });
    if (missing(error, "defect_trend_notes")) throw new RemedyUnavailableError();
    if (error && missingAuditColumn(error)) {
      const { error: legacyErr } = await db.from("defect_trend_notes").upsert(
        {
          id: row.id,
          company_id: company,
          kind: row.kind,
          graph: row.graph,
          period: row.period,
          description: row.description,
          remedy: row.remedy,
          updated_at: row.updatedAt,
          updated_by: row.updatedBy,
        },
        { onConflict: "id" },
      );
      if (missing(legacyErr, "defect_trend_notes")) throw new RemedyUnavailableError();
      if (legacyErr) throw legacyErr;
      return this.read(company);
    }
    if (error) throw error;
    return this.read(company);
  }

  async removeTrend(company: string, id: string): Promise<RemedyRead> {
    const { error } = await this.db().from("defect_trend_notes").delete().eq("company_id", company).eq("id", id);
    if (missing(error, "defect_trend_notes")) throw new RemedyUnavailableError();
    if (error) throw error;
    return this.read(company);
  }

  async importIfEmpty(company: string, incoming: RemedyBookRow): Promise<RemedyRead> {
    const current = await this.read(company);
    if (current.source !== "db") throw new RemedyUnavailableError(current.error);
    const empty = Object.keys(current.book.defects).length === 0 && current.book.trends.length === 0;
    if (!empty) return current;
    for (const row of Object.values(validatedDefects(incoming.defects))) {
      await this.saveDefect(company, row);
    }
    for (const row of incoming.trends) {
      if (!isCompleteTrend(row)) continue;
      await this.saveTrend(company, row);
    }
    return this.read(company);
  }
}

function isCompleteTrend(row: TrendNoteRow): boolean {
  return Boolean(row.id && row.description.trim() && row.remedy.trim());
}

let memory: MemoryRemedyStore | null = null;
let remote: SupabaseRemedyStore | null = null;

export function getRemedyStore(): RemedyStore {
  if (!shouldUseSupabase()) {
    memory ??= new MemoryRemedyStore();
    return memory;
  }
  remote ??= new SupabaseRemedyStore();
  return remote;
}

export function __resetRemedyStoreForTests(): void {
  memory = new MemoryRemedyStore();
  remote = null;
}

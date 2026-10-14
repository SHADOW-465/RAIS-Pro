// Plant defect-remedy book.
// Memory when MOID_STORE=memory. Supabase otherwise.
// A missing table (migration not applied) is "unavailable" — the browser
// keeps localStorage and imports it once the table exists.

import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";

export interface RemedyRow {
  code: string;
  description: string;
  remedy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface TrendNoteRow {
  id: string;
  kind: "spike" | "dip";
  graph: string;
  period: string;
  description: string;
  remedy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface RemedyBookRow {
  defects: Record<string, RemedyRow>;
  trends: TrendNoteRow[];
}

export type RemedyRead = { source: "db" | "unavailable"; book: RemedyBookRow };

const EMPTY: RemedyBookRow = { defects: {}, trends: [] };

function companyId(): string {
  return process.env.MOID_COMPANY_ID || "default";
}

export interface RemedyStore {
  read(company?: string): Promise<RemedyRead>;
  saveDefect(company: string, row: RemedyRow): Promise<RemedyRead>;
  saveTrend(company: string, row: TrendNoteRow): Promise<RemedyRead>;
  removeTrend(company: string, id: string): Promise<RemedyRead>;
  /** Write a browser book only when the plant book is still empty. */
  importIfEmpty(company: string, book: RemedyBookRow): Promise<RemedyRead>;
}

class MemoryRemedyStore implements RemedyStore {
  private byCompany = new Map<string, RemedyBookRow>();

  private book(company: string): RemedyBookRow {
    return this.byCompany.get(company) ?? { defects: {}, trends: [] };
  }

  async read(company = companyId()): Promise<RemedyRead> {
    return { source: "db", book: this.book(company) };
  }

  async saveDefect(company: string, row: RemedyRow): Promise<RemedyRead> {
    const book = this.book(company);
    const next = { ...book, defects: { ...book.defects, [row.code]: row } };
    this.byCompany.set(company, next);
    return { source: "db", book: next };
  }

  async saveTrend(company: string, row: TrendNoteRow): Promise<RemedyRead> {
    const book = this.book(company);
    const trends = [row, ...book.trends.filter((t) => t.id !== row.id)];
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
      defects: { ...incoming.defects },
      trends: [...incoming.trends],
    };
    this.byCompany.set(company, next);
    return { source: "db", book: next };
  }
}

function missing(err: { code?: string; message?: string } | null, table: string): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    (msg.toLowerCase().includes(table) && /does not exist|not find|schema cache/i.test(msg))
  );
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
      return { source: "unavailable", book: EMPTY };
    }
    if (defects.error) throw defects.error;
    if (trends.error) throw trends.error;
    const book: RemedyBookRow = { defects: {}, trends: [] };
    for (const r of defects.data ?? []) {
      const code = String(r.code);
      book.defects[code] = {
        code,
        description: String(r.description ?? ""),
        remedy: String(r.remedy ?? ""),
        updatedAt: String(r.updated_at),
        updatedBy: String(r.updated_by ?? ""),
      };
    }
    for (const r of trends.data ?? []) {
      const kind = r.kind === "dip" ? "dip" : "spike";
      book.trends.push({
        id: String(r.id),
        kind,
        graph: String(r.graph ?? ""),
        period: String(r.period ?? ""),
        description: String(r.description ?? ""),
        remedy: String(r.remedy ?? ""),
        updatedAt: String(r.updated_at),
        updatedBy: String(r.updated_by ?? ""),
      });
    }
    return { source: "db", book };
  }

  async saveDefect(company: string, row: RemedyRow): Promise<RemedyRead> {
    const { error } = await this.db().from("defect_remedies").upsert(
      {
        company_id: company,
        code: row.code,
        description: row.description,
        remedy: row.remedy,
        updated_at: row.updatedAt,
        updated_by: row.updatedBy,
      },
      { onConflict: "company_id,code" },
    );
    if (missing(error, "defect_remedies")) return { source: "unavailable", book: EMPTY };
    if (error) throw error;
    return this.read(company);
  }

  async saveTrend(company: string, row: TrendNoteRow): Promise<RemedyRead> {
    const { error } = await this.db().from("defect_trend_notes").upsert(
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
    if (missing(error, "defect_trend_notes")) return { source: "unavailable", book: EMPTY };
    if (error) throw error;
    return this.read(company);
  }

  async removeTrend(company: string, id: string): Promise<RemedyRead> {
    const { error } = await this.db().from("defect_trend_notes").delete().eq("company_id", company).eq("id", id);
    if (missing(error, "defect_trend_notes")) return { source: "unavailable", book: EMPTY };
    if (error) throw error;
    return this.read(company);
  }

  async importIfEmpty(company: string, incoming: RemedyBookRow): Promise<RemedyRead> {
    const current = await this.read(company);
    if (current.source !== "db") return current;
    const empty = Object.keys(current.book.defects).length === 0 && current.book.trends.length === 0;
    if (!empty) return current;
    for (const row of Object.values(incoming.defects)) {
      const saved = await this.saveDefect(company, row);
      if (saved.source !== "db") return saved;
    }
    for (const row of incoming.trends) {
      const saved = await this.saveTrend(company, row);
      if (saved.source !== "db") return saved;
    }
    return this.read(company);
  }
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

// Plant CAPA register.
// Memory when MOID_STORE=memory. Supabase otherwise.
// A missing table (migration 20261021_capa_actions.sql not applied) is
// "unavailable" — the browser keeps localStorage and imports it once the
// table exists. Same posture as lib/remedies/store.ts.

import { z } from "zod";
import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";

/** Mirrors CapaRecord in lib/capa-store.ts. The API rejects anything else. */
export const CapaRecordSchema = z.object({
  id: z.string().trim().min(1).max(200),
  title: z.string().max(500),
  problem: z.string().max(5000),
  rootCause: z.string().max(5000),
  action: z.string().max(5000),
  owner: z.string().max(200),
  dueDate: z.string().max(10),
  priority: z.enum(["High", "Medium", "Low"]),
  status: z.enum(["Open", "In Progress", "Completed"]),
  stage: z.string().max(200),
  severity: z.enum(["critical", "warning", "info"]).optional(),
  source: z.enum(["engine", "manual"]),
  ruleId: z.string().nullable().optional(),
  ruleVersion: z.number().nullable().optional(),
  vars: z.record(z.string(), z.number()).optional(),
  createdAt: z.string().min(1),
});

export type CapaRow = z.infer<typeof CapaRecordSchema>;

export type CapaRead = { source: "db" | "unavailable"; capas: CapaRow[] };

export interface CapaStore {
  read(company: string): Promise<CapaRead>;
  save(company: string, row: CapaRow, actor: string): Promise<CapaRead>;
  remove(company: string, id: string): Promise<CapaRead>;
  /** Write a browser list only when the plant register is still empty. */
  importIfEmpty(company: string, rows: CapaRow[], actor: string): Promise<CapaRead>;
}

const newestFirst = (a: CapaRow, b: CapaRow) => b.createdAt.localeCompare(a.createdAt);

class MemoryCapaStore implements CapaStore {
  private byCompany = new Map<string, Map<string, CapaRow>>();

  private of(company: string) {
    let m = this.byCompany.get(company);
    if (!m) this.byCompany.set(company, (m = new Map()));
    return m;
  }

  async read(company: string): Promise<CapaRead> {
    return { source: "db", capas: [...this.of(company).values()].sort(newestFirst) };
  }

  async save(company: string, row: CapaRow): Promise<CapaRead> {
    this.of(company).set(row.id, row);
    return this.read(company);
  }

  async remove(company: string, id: string): Promise<CapaRead> {
    this.of(company).delete(id);
    return this.read(company);
  }

  async importIfEmpty(company: string, rows: CapaRow[]): Promise<CapaRead> {
    const m = this.of(company);
    if (m.size === 0) for (const r of rows) m.set(r.id, r);
    return this.read(company);
  }
}

function unavailable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return (
    err.code === "42P01" || // undefined_table
    err.code === "PGRST205" || // PostgREST schema cache: table not found
    err.code === "42501" || // anon key against a service-role-only table
    (/capa_actions/i.test(msg) && /does not exist|not find|schema cache/i.test(msg))
  );
}

const UNAVAILABLE: CapaRead = { source: "unavailable", capas: [] };

class SupabaseCapaStore implements CapaStore {
  private db() {
    return createServerClient();
  }

  async read(company: string): Promise<CapaRead> {
    const { data, error } = await this.db()
      .from("capa_actions")
      .select("record")
      .eq("company_id", company)
      .order("created_at", { ascending: false });
    if (unavailable(error)) return UNAVAILABLE;
    if (error) throw error;
    const capas: CapaRow[] = [];
    for (const r of data ?? []) {
      const parsed = CapaRecordSchema.safeParse(r.record);
      if (parsed.success) capas.push(parsed.data);
    }
    return { source: "db", capas };
  }

  async save(company: string, row: CapaRow, actor: string): Promise<CapaRead> {
    const { error } = await this.db().from("capa_actions").upsert(
      {
        company_id: company,
        id: row.id,
        record: row,
        status: row.status,
        due_date: row.dueDate,
        created_at: row.createdAt,
        updated_at: new Date().toISOString(),
        updated_by: actor,
      },
      { onConflict: "company_id,id" },
    );
    if (unavailable(error)) return UNAVAILABLE;
    if (error) throw error;
    return this.read(company);
  }

  async remove(company: string, id: string): Promise<CapaRead> {
    const { error } = await this.db().from("capa_actions").delete().eq("company_id", company).eq("id", id);
    if (unavailable(error)) return UNAVAILABLE;
    if (error) throw error;
    return this.read(company);
  }

  async importIfEmpty(company: string, rows: CapaRow[], actor: string): Promise<CapaRead> {
    const current = await this.read(company);
    if (current.source !== "db" || current.capas.length > 0) return current;
    for (const row of rows) {
      const saved = await this.save(company, row, actor);
      if (saved.source !== "db") return saved;
    }
    return this.read(company);
  }
}

const g = globalThis as unknown as { __moidCapaStore?: CapaStore };

export function getCapaStore(): CapaStore {
  g.__moidCapaStore ??= shouldUseSupabase() ? new SupabaseCapaStore() : new MemoryCapaStore();
  return g.__moidCapaStore;
}

/** Tests only. */
export function __resetCapaStoreForTests(): void {
  delete g.__moidCapaStore;
}

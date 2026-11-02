// Plant shared settings. Memory when MOID_STORE=memory. Supabase otherwise.
// A missing table is an error, never an empty document: an empty document
// would tell a browser to import and then look like success.

import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";
import {
  grantsOf,
  isEmptyRecord,
  type SharedKind,
  type StoredGrant,
  SHARED_STATE_UNAVAILABLE_MESSAGE,
} from "./kinds";

// Defined in kinds.ts so the browser-side sync can import it without pulling
// this server-only module (and the Supabase client) into the client bundle.
export { SHARED_STATE_UNAVAILABLE_MESSAGE };

export class SharedStateUnavailableError extends Error {
  constructor(message = SHARED_STATE_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "SharedStateUnavailableError";
  }
}

export type SharedRead = { source: "db"; record: unknown };

export interface SharedStateStore {
  read(company: string, kind: SharedKind): Promise<SharedRead>;
  replace(company: string, kind: SharedKind, record: unknown, actor: string): Promise<SharedRead>;
  /** Write only when the plant document is still empty. Never overwrites. */
  importIfEmpty(
    company: string,
    kind: SharedKind,
    record: unknown,
    actor: string,
  ): Promise<SharedRead & { imported: boolean }>;
  /** Add or replace one grant. Other entry keys stay. */
  mergeGrant(company: string, grant: StoredGrant, actor: string): Promise<SharedRead>;
  revokeGrant(company: string, entryKey: string, actor: string): Promise<SharedRead>;
}

/** PostgREST / Postgres signals that the table is not there or not readable. */
export function sharedStateMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    err.code === "42501" ||
    (/plant_shared_state/i.test(msg) && /does not exist|not find|schema cache/i.test(msg))
  );
}

class MemorySharedStateStore implements SharedStateStore {
  private docs = new Map<string, unknown>();

  private key(company: string, kind: SharedKind): string {
    return `${company}\0${kind}`;
  }

  async read(company: string, kind: SharedKind): Promise<SharedRead> {
    const record = this.docs.has(this.key(company, kind)) ? this.docs.get(this.key(company, kind)) : null;
    return { source: "db", record: record ?? null };
  }

  async replace(company: string, kind: SharedKind, record: unknown): Promise<SharedRead> {
    this.docs.set(this.key(company, kind), record);
    return { source: "db", record };
  }

  async importIfEmpty(
    company: string,
    kind: SharedKind,
    record: unknown,
  ): Promise<SharedRead & { imported: boolean }> {
    const current = await this.read(company, kind);
    if (!isEmptyRecord(kind, current.record)) return { ...current, imported: false };
    const saved = await this.replace(company, kind, record);
    return { ...saved, imported: true };
  }

  async mergeGrant(company: string, grant: StoredGrant): Promise<SharedRead> {
    const current = await this.read(company, "edit-grants");
    const next = [grant, ...grantsOf(current.record).filter((g) => g.entryKey !== grant.entryKey)];
    return this.replace(company, "edit-grants", { grants: next });
  }

  async revokeGrant(company: string, entryKey: string): Promise<SharedRead> {
    const current = await this.read(company, "edit-grants");
    const next = grantsOf(current.record).filter((g) => g.entryKey !== entryKey);
    return this.replace(company, "edit-grants", { grants: next });
  }
}

class SupabaseSharedStateStore implements SharedStateStore {
  private db() {
    return createServerClient();
  }

  private raiseIfMissing(error: { code?: string; message?: string } | null): void {
    if (sharedStateMissing(error)) throw new SharedStateUnavailableError();
  }

  async read(company: string, kind: SharedKind): Promise<SharedRead> {
    const { data, error } = await this.db()
      .from("plant_shared_state")
      .select("record")
      .eq("company_id", company)
      .eq("kind", kind)
      .maybeSingle();
    this.raiseIfMissing(error);
    if (error) throw error;
    return { source: "db", record: data?.record ?? null };
  }

  async replace(company: string, kind: SharedKind, record: unknown, actor: string): Promise<SharedRead> {
    const { error } = await this.db().from("plant_shared_state").upsert(
      {
        company_id: company,
        kind,
        record,
        updated_at: new Date().toISOString(),
        updated_by: actor,
      },
      { onConflict: "company_id,kind" },
    );
    this.raiseIfMissing(error);
    if (error) throw error;
    return { source: "db", record };
  }

  async importIfEmpty(
    company: string,
    kind: SharedKind,
    record: unknown,
    actor: string,
  ): Promise<SharedRead & { imported: boolean }> {
    const current = await this.read(company, kind);
    if (!isEmptyRecord(kind, current.record)) return { ...current, imported: false };
    const saved = await this.replace(company, kind, record, actor);
    return { ...saved, imported: true };
  }

  async mergeGrant(company: string, grant: StoredGrant, actor: string): Promise<SharedRead> {
    const current = await this.read(company, "edit-grants");
    const next = [grant, ...grantsOf(current.record).filter((g) => g.entryKey !== grant.entryKey)];
    return this.replace(company, "edit-grants", { grants: next }, actor);
  }

  async revokeGrant(company: string, entryKey: string, actor: string): Promise<SharedRead> {
    const current = await this.read(company, "edit-grants");
    const next = grantsOf(current.record).filter((g) => g.entryKey !== entryKey);
    return this.replace(company, "edit-grants", { grants: next }, actor);
  }
}

const g = globalThis as unknown as { __moidSharedState?: SharedStateStore };

export function getSharedStateStore(): SharedStateStore {
  g.__moidSharedState ??= shouldUseSupabase() ? new SupabaseSharedStateStore() : new MemorySharedStateStore();
  return g.__moidSharedState;
}

/** Tests only. */
export function __resetSharedStateForTests(): void {
  delete g.__moidSharedState;
}

/** Tests only. Pass null to clear an injected store. */
export function __setSharedStateStoreForTests(store: SharedStateStore | null): void {
  if (store) g.__moidSharedState = store;
  else delete g.__moidSharedState;
}

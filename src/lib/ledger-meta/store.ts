// The "something changed" counter behind /api/ledger-meta.
// Until supabase/migrations/20261101130000_ledger_meta.sql is applied the row
// does not exist, so every read says "unavailable" and the caller falls back to
// a timer. A missing table is never reported as version 0.

import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";

export const LEDGER_META_UNAVAILABLE_MESSAGE =
  "Live updates are not set up. Apply supabase/migrations/20261101130000_ledger_meta.sql. Until then screens reload on a timer.";

export interface LedgerMeta {
  version: number;
  updatedAt: string | null;
}

export class LedgerMetaUnavailableError extends Error {
  constructor(message = LEDGER_META_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "LedgerMetaUnavailableError";
  }
}

/** Table or row not there, or not readable by this key. */
export function ledgerMetaMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    err.code === "42501" ||
    (/ledger_meta/i.test(err.message ?? "") && /does not exist|not find|schema cache/i.test(err.message ?? ""))
  );
}

/** Reads the single ledger_meta row. Throws LedgerMetaUnavailableError when
 *  there is no database or the migration has not been applied. */
export async function readLedgerMeta(): Promise<LedgerMeta> {
  if (!shouldUseSupabase()) throw new LedgerMetaUnavailableError("Live updates need the database store.");
  const { data, error } = await createServerClient()
    .from("ledger_meta")
    .select("version, updated_at")
    .eq("id", 1)
    .maybeSingle();
  if (ledgerMetaMissing(error)) throw new LedgerMetaUnavailableError();
  if (error) throw error;
  if (!data) throw new LedgerMetaUnavailableError();
  // bigint comes back as a number from PostgREST; a string if it ever outgrows 2^53.
  const version = Number(data.version);
  if (!Number.isFinite(version)) throw new LedgerMetaUnavailableError();
  return { version, updatedAt: data.updated_at ?? null };
}

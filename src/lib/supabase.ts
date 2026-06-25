// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Browser-safe client (anon key). Used in client components only.
 * Instantiated lazily so module evaluation does not throw during build
 * when env vars are absent.
 */
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!anon) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  return createClient(url, anon);
}

/**
 * Server-side database client.
 * NEVER import this in client components.
 * Only use in Next.js API route handlers (server-side).
 *
 * On-prem (Stage B): when `DATABASE_URL` is set, returns a supabase-js-shaped
 * client backed by a plain Postgres pool (`createPgClient`). Otherwise it falls
 * back to the hosted Supabase client (service role key) for cloud dev.
 *
 * Return type is intentionally `any`: the two concrete clients (the pg shim and
 * supabase-js) share the `.from(...).select(...)…` → `{ data, error }` surface
 * the codebase uses, but their full generic types are structurally different
 * and a union of them is not callable. Callers consume the shared subset.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServerClient(): any {
  if (process.env.DATABASE_URL) {
    // Lazy require so `pg` is only loaded on the Postgres path (and stays a
    // server-external package). Returns the same { data, error } builder shape.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPgClient } = require("./db/pg-client") as typeof import("./db/pg-client");
    return createPgClient();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  
  const keyToUse = serviceKey || anonKey;
  if (!keyToUse) throw new Error("Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is set");

  if (!serviceKey) {
    console.warn("[supabase] SUPABASE_SERVICE_ROLE_KEY not set, falling back to anon key. RLS may block operations.");
  }

  return createClient(url, keyToUse, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

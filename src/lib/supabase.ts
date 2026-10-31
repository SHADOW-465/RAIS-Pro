// src/lib/supabase.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-side client. `server-only` makes the build fail if a client component
 * ever imports this module: the browser never talks to Supabase directly, every
 * read and write goes through an API route, so the RLS lockdown migration can
 * deny anon/authenticated outright.
 *
 * Key preference: SUPABASE_SERVICE_ROLE_KEY, else the anon key (the behaviour
 * before the lockdown existed). Without the service key the app still runs, but
 * the lockdown migration would block it, so we warn loudly once.
 */

export type SupabaseKeyKind = "service_role" | "anon" | "none";

function resolveKey(): { key: string; kind: SupabaseKeyKind } {
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (serviceKey) return { key: serviceKey, kind: "service_role" };
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (anonKey) return { key: anonKey, kind: "anon" };
  return { key: "", kind: "none" };
}

/** Which key the server client uses. Never returns the key itself. */
export function supabaseKeyKind(): SupabaseKeyKind {
  return resolveKey().kind;
}

let warnedNoServiceKey = false;

export function createServerClient() {
  // On Docker plant installs the browser must hit the LAN public URL, while
  // the Next server should talk to PostgREST on the compose network.
  const url =
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    throw new Error(
      "SUPABASE_INTERNAL_URL or NEXT_PUBLIC_SUPABASE_URL is not set",
    );
  }

  const { key, kind } = resolveKey();
  if (!key) {
    throw new Error(
      "Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is set",
    );
  }

  if (kind !== "service_role" && !warnedNoServiceKey) {
    warnedNoServiceKey = true;
    console.warn(
      "[supabase] service role key missing - DB lockdown will block this deployment. " +
        "Set SUPABASE_SERVICE_ROLE_KEY before running the lockdown SQL. Using the anon key for now.",
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

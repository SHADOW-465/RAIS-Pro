// src/lib/supabase.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-side client (service role key). `server-only` makes the build fail if
 * a client component ever imports this module. The browser never talks to
 * Supabase directly: every read and write goes through an API route, so RLS
 * can deny anon/authenticated outright (see the RLS lockdown migration).
 */
export function createServerClient() {
  // On Docker plant installs the browser must hit the LAN public URL, while
  // the Next server should talk to PostgREST on the compose network.
  const url =
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  if (!url) {
    throw new Error(
      "SUPABASE_INTERNAL_URL or NEXT_PUBLIC_SUPABASE_URL is not set",
    );
  }
  // No anon-key fallback: with RLS locked down it would fail every query with
  // a confusing permission error instead of this one.
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. The server needs the service-role key " +
        "(Supabase → Project Settings → API); the anon key is never used server-side.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

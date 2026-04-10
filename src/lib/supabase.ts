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
 * Server-side client (service role key).
 * NEVER import this in client components — it exposes the service role key.
 * Only use in Next.js API route handlers (server-side).
 */
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

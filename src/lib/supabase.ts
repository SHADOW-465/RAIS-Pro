// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Browser-safe client (anon key). Used in client components only. */
export const supabase = createClient(url, anon);

/**
 * Server-side client (service role key).
 * NEVER import this in client components — it exposes the service role key.
 * Only use in Next.js API route handlers (server-side).
 */
export function createServerClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

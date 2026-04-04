import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Creates a processing session. Returns session id or null if auth is not configured. */
export async function createSession(): Promise<string | null> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ status: 'processing' })
    .select('id')
    .single();

  if (error) {
    // Auth not configured or RLS blocking — non-fatal, analysis proceeds without persistence
    console.warn('Session creation skipped:', error.message);
    return null;
  }
  return data.id as string;
}

/** Persists analysis result. Silently skips if sessionId is null. */
export async function saveAnalysisResult(
  sessionId: string,
  analysisJson: object,
  metadataJson?: object
): Promise<void> {
  const { error } = await supabase
    .from('dashboards')
    .insert({ session_id: sessionId, analysis_json: analysisJson, metadata_json: metadataJson ?? null });

  if (error) {
    console.warn('Analysis persistence skipped:', error.message);
  }
}

/** Marks a session as complete. */
export async function completeSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'complete' })
    .eq('id', sessionId);

  if (error) {
    console.warn('Session update skipped:', error.message);
  }
}

import { supabase, createSession, saveAnalysisResult, completeSession } from './supabase';
import type { SheetSummary } from './parser';
import type { AnalysisResult } from './types';

export class AnalysisError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export async function runAnalysis(
  summaries: SheetSummary[],
  sourceFiles: string[] = []
): Promise<AnalysisResult> {
  // Attempt to open a session for persistence — non-blocking if auth not configured
  const sessionId = await createSession();

  const { data, error } = await supabase.functions.invoke('analyze', {
    body: { summaries },
  });

  if (error) {
    const detail =
      (error as { message?: string }).message ??
      (typeof error === 'string' ? error : JSON.stringify(error));

    if (detail.includes('Failed to send') || detail.includes('NetworkError')) {
      throw new AnalysisError(
        'Cannot reach the analysis service. Check your network connection and Supabase URL.',
        error
      );
    }
    if (detail.includes('404') || detail.includes('not found')) {
      throw new AnalysisError(
        'The "analyze" Edge Function is not deployed. Run `supabase functions deploy analyze`.',
        error
      );
    }
    if (detail.includes('401') || detail.includes('403') || detail.includes('unauthorized')) {
      throw new AnalysisError(
        'Invalid Supabase credentials. Verify NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
        error
      );
    }
    throw new AnalysisError(`Analysis engine error: ${detail}`, error);
  }

  if (!data || typeof data !== 'object') {
    throw new AnalysisError(
      'The analysis service returned an empty or invalid response. Check the Edge Function logs.'
    );
  }

  const result: AnalysisResult = { ...data, sourceFiles };

  // Persist result — non-blocking, failures are logged not thrown
  if (sessionId) {
    await saveAnalysisResult(sessionId, result, { fileCount: summaries.length });
    await completeSession(sessionId);
  }

  return result;
}

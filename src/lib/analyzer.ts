import { SheetSummary } from './parser';

export async function runAnalysis(summaries: SheetSummary[]): Promise<any> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summaries }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('Analysis failed:', body);
    throw new Error(body.error || 'Analysis engine failure');
  }

  return res.json();
}

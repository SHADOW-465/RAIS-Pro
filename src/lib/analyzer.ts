// src/lib/analyzer.ts
import { SheetSummary } from './parser';

function selectSheetsForPrompt(summaries: any[]): SheetSummary[] {
  const byFile = new Map<string, any[]>();
  for (const s of summaries) {
    const file = s.name.split(' - ')[0];
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(s);
  }

  const selected: any[] = [];
  for (const [, sheets] of byFile) {
    const yearly = sheets.filter((s: any) => s.isYearly);
    if (yearly.length > 0) {
      selected.push(...yearly);
    } else {
      selected.push(...sheets);
    }
  }
  return selected;
}

export async function runAnalysis(
  summaries: any[]
): Promise<{ config: any; dataSummary: string }> {
  const filtered = selectSheetsForPrompt(summaries);
  const dataSummary = JSON.stringify(filtered).slice(0, 12000);

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summaries: filtered }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('Analysis failed:', body);
    throw new Error(body.error || 'Analysis engine failure');
  }

  const config = await res.json();
  return { config, dataSummary };
}

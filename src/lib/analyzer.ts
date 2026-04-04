import { SheetSummary } from './parser';

// Prioritize yearly/summary sheets so the AI prompt stays within the 12k char budget
// while containing the most informative data. Falls back to monthly sheets when no
// yearly sheet exists for a given file.
function selectSheetsForPrompt(summaries: any[]): SheetSummary[] {
  // Group by file name (the part before " - ")
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
      // No yearly sheet — include all monthly sheets for this file
      selected.push(...sheets);
    }
  }
  return selected;
}

export async function runAnalysis(summaries: any[]): Promise<any> {
  const filtered = selectSheetsForPrompt(summaries);

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

  return res.json();
}

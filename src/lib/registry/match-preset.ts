// Ranks existing presets by structural similarity to a freshly extracted
// workbook schema. This NEVER auto-decides — it only ranks candidates for
// an operator to confirm or reject (see docs design: presets must never
// silently merge).

export interface PresetSummary {
  clientId: string;
  name: string;
  stages: { stageId: string; fields?: { name: string }[] }[];
}

export interface PresetMatch {
  clientId: string;
  name: string;
  score: number; // 0..1, Jaccard overlap of (stage ids ∪ column names)
}

function tokensOf(stages: { stageId: string; fields?: { name: string }[] }[]): Set<string> {
  const set = new Set<string>();
  for (const s of stages) {
    set.add(`stage:${s.stageId}`);
    for (const f of s.fields || []) set.add(`col:${f.name.toLowerCase()}`);
  }
  return set;
}

export function matchAgainstPresets(
  extracted: { stages: { stageId: string; fields?: { name: string }[] }[] },
  presets: PresetSummary[]
): PresetMatch[] {
  const a = tokensOf(extracted.stages);
  return presets
    .map((p) => {
      const b = tokensOf(p.stages);
      const intersection = [...a].filter((t) => b.has(t)).length;
      const union = new Set([...a, ...b]).size;
      return { clientId: p.clientId, name: p.name, score: union === 0 ? 0 : intersection / union };
    })
    .sort((x, y) => y.score - x.score);
}

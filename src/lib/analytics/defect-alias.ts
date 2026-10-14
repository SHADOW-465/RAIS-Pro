// Resolve a raw defect label to a Plant Schema code.
//
// Read paths use this so a ledger row that still has defectCode null can
// match a catalog alias or a learned defect-alias. Nothing here writes the
// ledger. Entry save uses the same match before a new event is hashed.

import { collapseKey } from "@/core/ontology/normalize";

export interface DefectAliasRef {
  key: string;
  canonicalId: string;
}

/** Stored aliases use `DEFECT:BM`. The catalog code is the part after the prefix. */
export function stripCanonicalPrefix(id: string): string {
  return id.replace(/^(STAGE|DEFECT|SIZE):/i, "").trim();
}

type AliasSource = {
  defects?: { defectCode?: string; aliases?: string[] }[];
  defectAliases?: DefectAliasRef[];
} | null | undefined;

/** Catalog aliases plus learned defect-alias mappings. Catalog codes match their own text. */
export function defectAliasesOf(registry: AliasSource): DefectAliasRef[] {
  const out: DefectAliasRef[] = [];
  for (const d of registry?.defects ?? []) {
    const code = d.defectCode?.trim();
    if (!code) continue;
    out.push({ key: code, canonicalId: code });
    for (const a of d.aliases ?? []) {
      if (a?.trim()) out.push({ key: a, canonicalId: code });
    }
  }
  for (const a of registry?.defectAliases ?? []) {
    if (a?.key?.trim() && a?.canonicalId?.trim()) out.push(a);
  }
  return out;
}

export interface ResolvedDefect {
  code: string | null;
  /** A raw label is present and no schema alias or catalog code matches it. */
  unresolved: boolean;
}

/**
 * Prefer a code already stored on the event. Otherwise match the raw label
 * to a schema alias (case and separators ignored). Unknown labels stay unresolved.
 */
export function resolveDefectCode(
  code: string | null | undefined,
  raw: string | null | undefined,
  aliases: DefectAliasRef[],
): ResolvedDefect {
  const stored = (code ?? "").trim();
  if (stored) return { code: stored, unresolved: false };
  const text = (raw ?? "").trim();
  if (!text) return { code: null, unresolved: false };
  const norm = collapseKey(text);
  if (!norm) return { code: null, unresolved: true };
  for (const a of aliases) {
    const keyNorm = collapseKey(a.key);
    const id = stripCanonicalPrefix(a.canonicalId);
    const idNorm = collapseKey(id);
    if ((keyNorm && keyNorm === norm) || (idNorm && idNorm === norm)) {
      if (id) return { code: id, unresolved: false };
    }
  }
  return { code: null, unresolved: true };
}

type DefectLike = {
  defectCode: string;
  label?: string;
  aliases?: string[];
  stages?: string[];
};

/** Copy defects and attach learned alias keys. Does not mutate the catalog. */
export function mergeDefectAliases<T extends DefectLike>(defects: T[], aliases: DefectAliasRef[]): T[] {
  const copy: T[] = defects.map((d) => ({
    ...d,
    aliases: [...new Set([...(d.aliases ?? []), d.defectCode].filter(Boolean))],
  }));
  for (const a of aliases) {
    const target = stripCanonicalPrefix(a.canonicalId);
    if (!target) continue;
    const norm = collapseKey(target);
    const hit = copy.find(
      (d) =>
        collapseKey(d.defectCode) === norm ||
        (d.aliases ?? []).some((x) => collapseKey(x) === norm),
    );
    const key = a.key.trim();
    if (!key) continue;
    if (hit) {
      if (!(hit.aliases ?? []).some((x) => collapseKey(x) === collapseKey(key))) {
        hit.aliases = [...(hit.aliases ?? []), key];
      }
    } else {
      copy.push({
        defectCode: target,
        label: target,
        aliases: [key, target],
        stages: [],
      } as unknown as T);
    }
  }
  return copy;
}

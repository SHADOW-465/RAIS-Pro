// src/core/ontology/normalize.ts
// The separator-insensitive normalizer analytics has always relied on
// (disposafe.ts normDefect): "90-10", "90/10", "90 10" collapse to one key.
// Lives here so resolver, builder, and (Phase 5) analytics share one copy.

export function collapseKey(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function slugId(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^\w-]+/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

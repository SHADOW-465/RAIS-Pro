// src/core/ontology/empty-registry.ts
// The registry-shaped EMPTY catalog. Pages fall back to this (never a
// hardcoded company) when no verified MOD exists yet — the UI degrades to its
// empty state instead of silently pretending Disposafe (ADD §4.3).

export const EMPTY_REGISTRY = {
  presetId: null as string | null,
  clientId: "none",
  name: "No verified ontology",
  registryVersion: "0",
  fiscalYearStartMonth: 4,
  stages: [] as any[],
  defects: [] as any[],
  sizes: [] as any[],
  stageAliases: {} as Record<string, never>,
  costConfig: null,
};

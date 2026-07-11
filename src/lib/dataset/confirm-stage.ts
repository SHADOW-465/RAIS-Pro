/** Resolves which preset a stage confirmation (or new-stage creation) should
 *  write against — the active registry's own presetId, never a hardcoded
 *  literal. `activeRegistry` is the same loosely-typed object `useRegistry()`
 *  and `/api/schema` already pass around this codebase. */
export function resolveConfirmPresetId(
  activeRegistry: { presetId?: string | null; clientId?: string | null } | null,
): string {
  return activeRegistry?.presetId ?? activeRegistry?.clientId ?? "default";
}

/** True when the given value is a label the user just typed for a brand-new
 *  stage (not one of the active registry's existing stages). */
export function isNewStageLabel(
  stageIdOrLabel: string,
  knownStages: { stageId: string }[],
): boolean {
  return !knownStages.some((s) => s.stageId === stageIdOrLabel);
}

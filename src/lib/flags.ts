// Feature flags for the MOD v2 strangler migration (docs/redesign/MOD-MIGRATION-PLAN.md).
// Off = legacy behavior, byte-for-byte. Flipped per-phase, removed in Phase 5.
// NEXT_PUBLIC_ so client components (staging) see it too; the bare name still
// works server-side.
export const MOD_PIPELINE =
  process.env.NEXT_PUBLIC_MOD_PIPELINE === "1" || process.env.MOD_PIPELINE === "1";

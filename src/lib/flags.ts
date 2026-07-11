// Feature flags for the MOD v2 strangler migration (docs/redesign/MOD-MIGRATION-PLAN.md).
// Off = legacy behavior, byte-for-byte. Flipped per-phase, removed in Phase 5.
export const MOD_PIPELINE = process.env.MOD_PIPELINE === "1";

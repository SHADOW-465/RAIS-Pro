// Test fixture: the historical Disposafe registry, frozen as data. Golden and
// analytics tests pass this EXPLICITLY — runtime code never imports it.
export { DISPOSAFE_REGISTRY } from "../../../scripts/disposafe-registry-data";

// Convenience wrappers bound to the fixture — legacy test call-shapes.
import { DISPOSAFE_REGISTRY as _REG } from "../../../scripts/disposafe-registry-data";
import { resolveDefect as _resolve, activeStageIds as _active } from "@/core/ontology/resolve-entity";
export const resolveDefect = (raw: string) => _resolve(raw, _REG);
export const activeStageIds = (isoDate: string) => _active(isoDate, _REG);

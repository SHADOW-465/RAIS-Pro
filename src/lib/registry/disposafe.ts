// Disposafe client registry — REJECTION-ONLY v1 (MOID-SPEC §3, §4).
//
// Versioned config, not events. Ingestion resolves raw sheet labels against
// this; unresolved labels yield a low-confidence event + a Finding (V-007),
// never an invented category. "Add field" (direct entry) appends here with an
// effectiveFrom date so historical rows stay valid.

import { ClientRegistry } from "@/lib/contract/d1";
import type { z } from "zod";

type Registry = z.infer<typeof ClientRegistry>;

/** The four rejection inspection stages — the entire v1 universe. */
export const DISPOSAFE_REGISTRY: Registry = {
  clientId: "disposafe",
  registryVersion: "1.0.0",
  fiscalYearStartMonth: 4, // April–March fiscal year
  stages: [
    { stageId: "visual",          label: "Visual Inspection",   effectiveFrom: null,         effectiveTo: null, upstream: [] },
    { stageId: "eye-punching",    label: "Eye Punching",        effectiveFrom: "2025-11-01", effectiveTo: null, upstream: ["visual"] },
    { stageId: "balloon",         label: "Balloon Testing",     effectiveFrom: null,         effectiveTo: null, upstream: ["eye-punching"] },
    { stageId: "valve-integrity", label: "Valve Integrity",     effectiveFrom: null,         effectiveTo: null, upstream: ["balloon"] },
    { stageId: "final",           label: "Final Inspection",    effectiveFrom: null,         effectiveTo: null, upstream: ["valve-integrity"] },
  ],
  defects: [
    { defectCode: "THSP", label: "Thin Spot",       aliases: ["THIN SPOD", "THIN SPOT", "THSP", "TT"],            stages: ["visual"] },
    { defectCode: "STBL", label: "Stuck Balloon",   aliases: ["STRUCK BALLOON", "STUCK BALLOON", "STBL", "SB"],   stages: ["visual", "balloon"] },
    { defectCode: "LEAK", label: "Leakage",         aliases: ["LEAKAGE", "LEAK"],                                  stages: ["valve-integrity", "balloon"] },
    { defectCode: "BLBR", label: "Balloon Burst",   aliases: ["BALLOON BRUST", "BALLOOM BRUST", "BALLOON BURST", "BLBR"], stages: ["balloon", "valve-integrity"] },
    { defectCode: "BUB",  label: "Bubble",          aliases: ["BUBBLE", "BUB", "BL"],                              stages: ["visual"] },
    { defectCode: "90/10", label: "90/10",          aliases: ["90/10"],                                            stages: ["valve-integrity"] },
    { defectCode: "PINH", label: "Pinhole",         aliases: ["PINHOLE", "PIN HOLE", "PH", "PINH"],                stages: ["visual", "final"] },
    { defectCode: "COAG", label: "Coagulum",        aliases: ["COAG", "COAGULUM"],                                 stages: ["visual"] },
    { defectCode: "SD",   label: "Surface Defect",  aliases: ["SURFACE DEFECT", "SD"],                             stages: ["visual"] },
    { defectCode: "RW",   label: "Raised Wire",     aliases: ["RAISED WIRE", "RW"],                                stages: ["visual"] },
    { defectCode: "BM",   label: "Black Mark",      aliases: ["BLACK MARK", "BM"],                                 stages: ["visual"] },
    { defectCode: "WEB",  label: "Webbing",         aliases: ["WEBBING", "WEB"],                                   stages: ["visual"] },
    { defectCode: "OTH",  label: "Others",          aliases: ["OTHERS", "OTHER", "OTH"],                           stages: ["visual", "balloon", "valve-integrity", "final"] },
  ],
  costConfig: null, // optional; user enters ₹/unit to unlock cost figures (MOID-SPEC §8)
};

/** Case/separator-insensitive alias resolution. Collapses ALL non-alphanumeric
 *  characters so "90-10", "90/10" and "90 10" (the same defect written three
 *  ways across sheets) all resolve to one code. Returns null when unknown
 *  (→ low-confidence event + Finding), never an invented category. */
const normDefect = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function resolveDefect(raw: string, reg: Registry = DISPOSAFE_REGISTRY): string | null {
  const norm = normDefect(raw);
  if (!norm) return null;
  for (const d of reg.defects) {
    if (d.aliases.some((a) => normDefect(a) === norm)) return d.defectCode;
  }
  return null;
}

/** The stage ids active on a given ISO date (respects effectiveFrom/To drift). */
export function activeStageIds(isoDate: string, reg: Registry = DISPOSAFE_REGISTRY): string[] {
  return reg.stages
    .filter((s) => (s.effectiveFrom == null || s.effectiveFrom <= isoDate) &&
                   (s.effectiveTo == null || isoDate <= s.effectiveTo))
    .map((s) => s.stageId);
}

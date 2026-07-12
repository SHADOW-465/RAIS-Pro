// Disposafe registry SEED DATA (MOD v2 Phase 5): consumed ONLY by the
// preset->MOD migration script and test fixtures. Runtime code reads the
// company's verified-MOD catalog (catalogFor) — never this constant.
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
    // Production / throughput chain (from Daily Activity Report). captures only
    // what the sheet records; no defect breakdown, not size-wise.
    { stageId: "production",        label: "Production",        effectiveFrom: null, effectiveTo: null, upstream: [],                 captures: ["checked","accepted","rejected"] },
    { stageId: "eye-punching",      label: "Eye Punching",      effectiveFrom: "2025-11-01", effectiveTo: null, upstream: ["production"], captures: ["checked","accepted","rejected"] },
    { stageId: "leaching",          label: "Leaching",          effectiveFrom: null, effectiveTo: null, upstream: ["eye-punching"],   captures: ["checked"] },
    { stageId: "chlorination",      label: "Chlorination",      effectiveFrom: null, effectiveTo: null, upstream: ["leaching"],       captures: ["checked"] },
    { stageId: "hanging",           label: "Hanging",           effectiveFrom: null, effectiveTo: null, upstream: ["chlorination"],   captures: ["checked"] },
    { stageId: "gauge",             label: "Gauge",             effectiveFrom: null, effectiveTo: null, upstream: ["hanging"],        captures: ["checked"] },
    { stageId: "trimming",          label: "Trimming",          effectiveFrom: null, effectiveTo: null, upstream: ["gauge"],          captures: ["checked"] },
    // Quality gates — size-wise + defect-bearing.
    { stageId: "visual",            label: "Visual Inspection", effectiveFrom: null, effectiveTo: null, upstream: ["trimming"],       captures: ["checked","accepted","hold","rejected"], sizeWise: true, isQualityGate: true },
    { stageId: "balloon",           label: "Balloon Testing",   effectiveFrom: null, effectiveTo: null, upstream: ["visual"],         captures: ["checked","accepted","hold","rejected"], sizeWise: true, isQualityGate: true },
    { stageId: "valve-fixing",      label: "Valve Fixing",      effectiveFrom: null, effectiveTo: null, upstream: ["balloon"],        captures: ["checked"] },
    { stageId: "valve-integrity",   label: "Valve Integrity",   effectiveFrom: null, effectiveTo: null, upstream: ["valve-fixing"],   captures: ["checked","accepted","hold","rejected"], sizeWise: true, isQualityGate: true },
    { stageId: "final",             label: "Final Inspection",  effectiveFrom: null, effectiveTo: null, upstream: ["valve-integrity"],captures: ["checked","accepted","hold","rejected"], sizeWise: true, isQualityGate: true },
    { stageId: "balloon-production",label: "Balloon Production", effectiveFrom: null, effectiveTo: null, upstream: [],                captures: ["checked","accepted","rejected"] },
  ],
  defects: [
    // Visual catalog (P17 SOP / FINAL & VISUAL sheets — 21 codes)
    { defectCode: "COAG", label: "Coagulum",         aliases: ["COAG","COAGULUM"],                              stages: ["visual"] },
    { defectCode: "SD",   label: "Surface Defect",   aliases: ["SD","SURFACE DEFECT"],                          stages: ["visual"] },
    { defectCode: "TT",   label: "Thin Tip",         aliases: ["TT","THIN TIP"],                                stages: ["visual"] },
    { defectCode: "BL",   label: "Blister",          aliases: ["BL","BLISTER"],                                 stages: ["visual"] },
    { defectCode: "PS",   label: "Ply Separation",   aliases: ["PS","PLY SEPARATION","PLY SEP"],                stages: ["visual"] },
    { defectCode: "SB",   label: "Step Balloon",     aliases: ["SB","STEP BALLOON"],                            stages: ["visual"] },
    { defectCode: "PW",   label: "Projected Wire",   aliases: ["PW","PROJECTED WIRE"],                          stages: ["visual"] },
    { defectCode: "FP",   label: "Foreign Particle", aliases: ["FP","FOREIGN PARTICLE"],                        stages: ["visual"] },
    { defectCode: "RW",   label: "Raised Wire",      aliases: ["RW","RAISED WIRE"],                             stages: ["visual"] },
    { defectCode: "BEP",  label: "Bad Eye Punching", aliases: ["BEP","BAD EYE PUNCHING"],                       stages: ["visual","eye-punching"] },
    { defectCode: "DEC",  label: "Decolourisation",  aliases: ["DEC","DECOLORISATION","DECOLOURISATION"],       stages: ["visual"] },
    { defectCode: "BM",   label: "Black Mark",       aliases: ["BM","BLACK MARK"],                              stages: ["visual"] },
    { defectCode: "WEB",  label: "Webbing",          aliases: ["WEB","WEBBING"],                                stages: ["visual"] },
    { defectCode: "BT",   label: "Bad Trimming",     aliases: ["BT","BAD TRIMMING"],                            stages: ["visual","final"] },
    { defectCode: "SF",   label: "Short Funnel",     aliases: ["SF","SHORT FUNNEL"],                            stages: ["visual","final"] },
    { defectCode: "BIC",  label: "Bend In Catheter", aliases: ["BIC","BEND IN CATHETER"],                       stages: ["visual"] },
    { defectCode: "WK",   label: "Wrinkle",          aliases: ["WK","WRINKLE"],                                 stages: ["visual","final"] },
    { defectCode: "BMP",  label: "Bump",             aliases: ["BMP","BP","BUMP"],                              stages: ["visual"] },
    { defectCode: "TF",   label: "Torn Funnel",      aliases: ["TF","TORN FUNNEL"],                             stages: ["visual","final"] },
    { defectCode: "PINH", label: "Pinhole",          aliases: ["PINH","PH","PIN HOLE","PINHOLE"],               stages: ["visual","final"] },
    { defectCode: "BST",  label: "Bad Stripping",    aliases: ["BST","BAD STRIPPING"],                          stages: ["visual"] },
    // Balloon section (size-wise valve book)
    { defectCode: "STBL", label: "Stuck Balloon",    aliases: ["STBL","STUCK BALLOON","STRUCK BALLOON"],        stages: ["balloon"] },
    { defectCode: "BLBR", label: "Balloon Burst",    aliases: ["BLBR","BALLOON BURST","BALLOON BRUST","BALLOOM BRUST"], stages: ["balloon"] },
    // Valve Integrity section
    { defectCode: "LEAK", label: "Leakage",          aliases: ["LEAK","LEAKAGE"],                               stages: ["balloon","valve-integrity"] },
    { defectCode: "90/10",label: "90/10",            aliases: ["90/10","90-10","9010"],                         stages: ["valve-integrity"] },
    { defectCode: "BUB",  label: "Bubble",           aliases: ["BUB","BUBBLE"],                                 stages: ["valve-integrity"] },
    { defectCode: "THSP", label: "Thin Spot",        aliases: ["THSP","THIN SPOT","THIN SPOD"],                 stages: ["valve-integrity"] },
    // Catch-all (every gate)
    { defectCode: "OTH",  label: "Others",           aliases: ["OTH","OTHER","OTHERS"],                         stages: ["visual","balloon","valve-integrity","final"] },
  ],
  sizes: [
    { sizeId: "Fr6",  label: "6 FR" },  { sizeId: "Fr8",  label: "8 FR" },
    { sizeId: "Fr10", label: "10 FR" }, { sizeId: "Fr12", label: "12 FR" },
    { sizeId: "Fr14", label: "14 FR" }, { sizeId: "Fr16", label: "16 FR" },
    { sizeId: "Fr18", label: "18 FR" }, { sizeId: "Fr20", label: "20 FR" },
    { sizeId: "Fr22", label: "22 FR" }, { sizeId: "Fr24", label: "24 FR" },
  ],
  costConfig: null,
};

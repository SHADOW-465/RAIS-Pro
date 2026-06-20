# 04 · Domain Registry & Ontology

Versioned **config** (not events), in `src/lib/registry/disposafe.ts` → `DISPOSAFE_REGISTRY` (Zod `ClientRegistry`). Persisted in the `registries` + `cost_config` tables; editable via `/api/schema`.

## 4.1 ClientRegistry shape
```
clientId, registryVersion, fiscalYearStartMonth (Disposafe=4 → Apr),
stages: StageDef[], defects: DefectDef[], costConfig: CostConfig|null
StageDef  = { stageId, label, effectiveFrom|null, effectiveTo|null, upstream: stageId[] }
DefectDef = { defectCode, label, aliases: string[] (≥1), stages: stageId[] }
CostConfig= { enabled, currency, finishedUnitCostInr|null, perStage: {stageId,costPerUnitInr}[], reworkCostPerUnitInr|null }
```

## 4.2 The 5 stages (funnel order)
| stageId | label | effectiveFrom | upstream |
|---|---|---|---|
| `visual` | Visual Inspection | — | [] |
| `eye-punching` | Eye Punching | **2025-11-01** | [visual] |
| `balloon` | Balloon Testing | — | [eye-punching] |
| `valve-integrity` | Valve Integrity | — | [balloon] |
| `final` | Final Inspection | — | [valve-integrity] |

`activeStageIds(isoDate)` returns only stages whose `effectiveFrom ≤ date ≤ effectiveTo` — handles the line adding Eye Punching mid-year without invalidating older rows. Entry stage for "units checked" = `visual`.

## 4.3 The 13 defect codes (+ aliases)
| code | label | key aliases (verbatim incl. misspellings) |
|---|---|---|
| THSP | Thin Spot | THIN SPOD, THIN SPOT, TT |
| STBL | Stuck Balloon | STRUCK BALLOON, STUCK BALLOON, SB |
| LEAK | Leakage | LEAKAGE |
| BLBR | Balloon Burst | BALLOON BRUST, BALLOOM BRUST, BALLOON BURST |
| BUB | Bubble | BUBBLE, BL |
| 90/10 | 90/10 | 90/10 |
| PINH | Pinhole | PINHOLE, PIN HOLE, PH |
| COAG | Coagulum | COAG, COAGULUM |
| SD | Surface Defect | SURFACE DEFECT, SD |
| RW | Raised Wire | RAISED WIRE, RW |
| BM | Black Mark | BLACK MARK, BM |
| WEB | Webbing | WEBBING, WEB |
| OTH | Others | OTHERS, OTHER, OTH |

The physical sheets carry ~21 reason codes (COAG, SD, TT, BL, PS, SB, PW, FP, RW, BEP, DEC, BM, WEB, BT, SF, BIC, WK, BMP, TF, PH, BST). Codes not in the 13-code v1 registry (PS, PW, FP, BEP, DEC, BT, SF, BIC, WK, BMP, TF, BST) resolve to `null` and are shown **verbatim** (low-confidence) — never invented, never "Unknown". Full sheet legend: [shop-floor-schemas xlsx](../shop-floor-schemas/shop-floor-log-schema.xlsx).

## 4.4 resolveDefect (separator-insensitive)
```ts
const normDefect = s => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
resolveDefect(raw) = first defect whose any alias normDefect-equals normDefect(raw), else null
```
So `"90-10"`, `"90/10"`, `"90 10"` all resolve to `90/10`; `"THIN SPOD"` → THSP. **Critical:** never key defect identity on punctuation.

## 4.5 Sizes
French sizes `6FR … 26FR` (stored as `"Fr16"` etc.; also `"Cumulative"`). `size` is a dimension on production/inspection/rejection events; `null` for whole-line rows.

## 4.6 File families (routing)
`routeFamily(filename)` → `size-wise | assembly-daily | rejection-analysis | stage-report | cumulative | null`. Precedence (dedup): `size-wise 40 > assembly-daily 30 = rejection-analysis 30 > stage-report 20 > cumulative 0 (claims only)`. `DAILY ACTIVITY REPORT` → `null` (skipped; layout mismatch + redundant for counts).

# 19 · Glossary & Decision Log

## 19.1 Glossary
| Term | Meaning |
|---|---|
| **MO!D / RAIS** | The app. Manufacturing Operational Intelligence & Diagnostics / Rejection Advisory & Intelligence System. |
| **Event ledger** | Append-only `CanonicalEvent[]` — the single source of truth. |
| **StageDayRecord** | Intermediate parse result; one stage·day·size row → events via `emit`. |
| **Canonicalize** | The read-time de-dup (`canonicalizeEvents`) guaranteeing no double-count. |
| **Family** | A workbook type (size-wise / rejection-analysis / assembly-daily / …) → routes to a parser, sets precedence. |
| **Σ-stage rate** | The client's "Total Rejection %" = sum of per-stage rejection rates. |
| **FPY** | First Pass Yield = Π(1 − stageRate), rolled-throughput. |
| **COPQ** | Cost of Poor Quality = Σ rejectedₛ × cost × stage-weight. |
| **Finding** | A flagged data discrepancy (V-001..V-013) awaiting human adjudication. |
| **Adjudication** | Human verdict (mistake/intentional/unsure) on a Finding; can spawn a rulebook rule. |
| **Provenance** | Cell refs + file hash + formula text that travel with every number. |
| **Stage** | Inspection gate: visual → eye-punching → balloon → valve-integrity → final. |
| **Fr / size** | French catheter size (6FR…26FR). |
| **ALCOA+** | Data-integrity standard for the audit export. |

## 19.2 Decision log (what was decided and why)
| Decision | Rationale |
|---|---|
| Append-only **event ledger**, not relational rows | Native audit trail, idempotency, order-independent dedup. The §4 golden relational schema is an optional projection. |
| **The model never computes numbers** | Eliminates hallucinated KPIs; deterministic + verifiable against the client's own sheets. |
| Dedup identity = **stage\|date** (size-wise authoritative) | Original `stage\|size\|date` key let whole-line + per-Fr rows both survive → ~2× inflation. |
| Read-side **canonicalizer** at `/api/events` | Makes correctness independent of store state; doubling-stable. Defense-in-depth with seed-time dedup. |
| Headline rate = **Σ stage rates** | Matches the client's YEARLY sheet (their reporting convention) — chosen by the client. |
| FPY = **Π(1−r)**, may differ from 1−rate | Correct rolled-throughput yield; the ~0.4% gap vs 1−Σrate is mathematical, not an error. |
| Stage yield = **1 − rejRate** (not good/checked) | Accepted events only partially captured → `good/checked` reported ~0%. |
| `resolveDefect` **separator-insensitive** | `90-10` vs `90/10` punctuation mismatch left defects unresolved. |
| **No auto-seed** (start blank) | Stale seed data from old code masked fixes; uploads/entry are the only real sources. |
| **Local LLM (Ollama)** + de-id + Nginx for prod | Plant network blocks + data-privacy on compound ratios/batch counts. |
| Export is **ZIP** not RAR | RAR needs a proprietary encoder; ZIP is the ALCOA+ standard container. |
| DAILY ACTIVITY REPORT **skipped** by routeFamily | Evolving multi-stage layout doesn't match the fixed parser; redundant for counts. |

## 19.3 Session-derived corrections (provenance of this spec)
This package reflects fixes proven against the client's data: cross-source double-count → read-side canonicalizer; cross-stage funnel sum → entry-stage checked; FPY/rejection-rate definitions; stage-yield bug; defect-resolution punctuation; multi-file upload (was using only `files[0]`); content-based Valve/Visual detection; honest empty states; no-auto-seed; ALCOA+ audit ZIP. All verified by `tsc` + 161 jest tests + build + the YEARLY-sheet golden match + doubling-stability.

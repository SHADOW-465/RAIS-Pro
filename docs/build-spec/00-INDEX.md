# MO!D / RAIS — Build Specification (master folder)
*v1.0 · June 2026 · the buildable blueprint for the on-prem production app*

This folder is the **complete, code-accurate specification** of the working PoC, laid out so a team can rebuild a deployment-ready version for the plant. Every formula, schema field, enum, and invariant here is extracted from the proven implementation.

## Reading order
| # | File | What it defines |
|---|---|---|
| 01 | [product-overview](01-product-overview.md) | Problem, scope, personas, goals, PoC vs production |
| 02 | [architecture-and-data-flow](02-architecture-and-data-flow.md) | System layers, the live pipeline, the legacy pipeline, topology |
| 03 | [data-model-event-ledger](03-data-model-event-ledger.md) | The canonical append-only event union (the heart) |
| 04 | [domain-registry-ontology](04-domain-registry-ontology.md) | Stages, defects, sizes, effective-dating, resolveDefect |
| 05 | [ingestion-pipeline](05-ingestion-pipeline.md) | routeFamily, family parsers, StageDayRecord, emit, staging |
| 06 | [dedup-canonicalization](06-dedup-canonicalization.md) | The no-double-count guarantee (two layers) |
| 07 | [analytics-engine](07-analytics-engine.md) | Every selector + exact formula |
| 08 | [validation-findings-rulebook](08-validation-findings-rulebook.md) | Validation rules, Findings (V-001..V-013), adjudication, rulebook |
| 09 | [ai-layer](09-ai-layer.md) | tryModels chain, classification graph, narrative, Ask RAS, de-id |
| 10 | [ui-ux-design-system](10-ui-ux-design-system.md) | Tokens, typography, theming, screens, charts |
| 11 | [persistence-and-store](11-persistence-and-store.md) | EventStore interface, backends, seeding policy |
| 12 | [database-schema-sql](12-database-schema-sql.md) | Actual Postgres tables (events ledger) |
| 13 | [export-audit-package](13-export-audit-package.md) | ALCOA+ ZIP, manifest, print report |
| 14 | [security-airgap](14-security-airgap.md) | De-id middleware, Nginx proxy, RLS, air-gap |
| 15 | [testing-verification](15-testing-verification.md) | Golden tests, harnesses, the correctness gates |
| 16 | [production-rebuild-guide](16-production-rebuild-guide.md) | On-prem changes, what to copy verbatim, steps |
| 17 | [module-map](17-module-map.md) | Every module → role → exports |
| 18 | [correctness-invariants](18-correctness-invariants.md) | The non-negotiable rules |
| 19 | [glossary-decisions](19-glossary-decisions.md) | Glossary + decision log |

## The one sentence that matters
**The dashboard is a pure deterministic function of an append-only event ledger; the LLM only classifies columns and writes prose — it never computes a KPI. All arithmetic is verified against the client's own embedded spreadsheet totals.**

## Companion docs (already in repo)
- [MOID-CANONICAL-SPEC.md](../MOID-CANONICAL-SPEC.md) — product vision, on-prem topology, security (still canonical for vision/security).
- [MOID-ENGINEERING-SPEC-v4.md](../MOID-ENGINEERING-SPEC-v4.md) — the single-file summary of this folder.
- [shop-floor-schemas/shop-floor-log-schema.xlsx](../shop-floor-schemas/shop-floor-log-schema.xlsx) — the physical daily-log field schema.

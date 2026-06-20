# 13 · Export — Audit-Ready Package

## 13.1 Audit ZIP (`src/lib/audit-package.ts`)
`buildAuditPackage(events, scope, registryVersion) → { blob, fileName }`. Wired to the AppShell **Export** button. **Dependency-free:** a minimal stored (uncompressed) ZIP writer (CRC-32 + local headers + central directory + EOCD) and **Web Crypto `crypto.subtle` SHA-256**. No JSZip, no external encoder.

**Contents:**
| File | Content |
|---|---|
| `01-rejection-summary.csv` | KPIs **with metric definitions** (Rejection Rate=Σ stage rates; FPY=Π(1−r); etc.) |
| `02-stage-wise.csv` | per stage: checked, rejected, rejection_rate, yield, contribution_pct |
| `03-defect-pareto.csv` | defect, code, rejected, pct_of_total, cumulative_pct |
| `04-size-wise.csv` | size, checked, rejected, rejection_rate |
| `05-monthly-trend.csv` | period, label, total_rejection_pct (Σ-stage) |
| `06-event-ledger.csv` | full canonical ledger w/ provenance (file, cell, extractedBy, recordedAt) |
| `manifest.json` | `{ package, standard:"ALCOA+…", generatedAt, registryVersion, hashAlgorithm:"SHA-256", eventCount, scope, files:[{file, sha256, bytes}] }` |

**Integrity:** every CSV's SHA-256 is in the manifest → an auditor unzips, re-hashes, and proves nothing was altered (ALCOA+: Attributable, Legible, Contemporaneous, Original, Accurate).

> Output is **ZIP**, not RAR. RAR requires a proprietary encoder; ZIP is the standard auditable container and what MOID-CANONICAL-SPEC §365 specifies.

## 13.2 Monthly report (print, `/reports`)
3-page A4, browser print-to-PDF, **excludes** Data Health Scorecard and Sign-Off blocks (moved to Ask RAS):
- **P1:** letterhead, month, AI executive insights, KPI strip, worst-stage ranking.
- **P2:** rejection trend (SVG), defect Pareto, size-wise table.
- **P3:** rejection counts by stage × size, active CAPA list.
Exactly 3 pages, no trailing blank page. A print emits an `AnnotationEvent` for the audit trail.

## 13.3 Verification of the package
`scripts/verify-audit-pack.ts` (pattern): build from canonical events → write zip → re-open with a zip lib → assert CRC integrity + every manifest hash matches. This must pass in CI before release.

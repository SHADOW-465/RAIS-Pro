# 01 · Product Overview

## 1.1 What it is
MO!D (Manufacturing Operational Intelligence & Diagnostics, a.k.a. RAIS — Rejection Advisory & Intelligence System) is a **rejection-intelligence cockpit** for a medical-device plant (Disposafe, Foley Balloon Catheter line). It converts messy daily inspection paperwork and monthly Excel workbooks into a traceable, auditable operating layer between the shop floor and executive decisions.

**V1 scope = rejections and money lost.** Not OEE, not full MES — just: how many units are rejected, where, why (defect), which size, what it costs (COPQ), and what to do.

## 1.2 The problem (why it exists)
1. **Unstable data:** rejection counts live in weekly summaries, monthly files, daily activity reports, and size-wise workbooks with broken formulas and external links.
2. **Action blindness:** the GM sees an overall rejection %, but not *why* a spike happened, which size (e.g. Fr16) drove it, or the corrective action.
3. **Audit risk:** ISO 13485 / CDSCO (MDR 2017) audits need days of manual file matching.
4. **Data privacy:** payloads to external LLMs must never expose compound ratios or raw batch counts.

## 1.3 Personas
| Persona | Uses |
|---|---|
| **GM** | Lands on cockpit; reads AI summary + KPIs + trend; exports the audit pack / monthly report. |
| **Quality Manager** | Drills stage / defect / size; runs SPC; asks Ask RAS; reviews Findings. |
| **Supervisor / Operator** | Uploads sheets; edits the staging grid; adds comments; adjudicates Findings; direct manual entry. |

## 1.4 Differentiators (the moat)
1. **Provenance:** every KPI traces to a source cell (`'VISUAL!C12'`) + file hash + edit comment.
2. **No double counting:** overlapping/duplicate uploads, re-seeds, multi-file batches can never inflate a number (read-side canonicalizer; proven stable under ledger-doubling).
3. **Reproduces the client's own charts:** clean-month numbers match the client's embedded YEARLY sheet **exactly**.
4. **The model never does maths:** AI = classification + prose only; all numbers are deterministic JS.

## 1.5 PoC vs Production
- **PoC (this repo):** Next.js + Supabase + cloud free-tier LLMs. Proves the engine and the UX.
- **Production (to build):** the same engine deployed **on-prem, air-gapped**, on the plant LAN, with a **local LLM (Ollama)**, **local PostgreSQL**, role-based access, and de-identification for any external AI call. See [16-production-rebuild-guide](16-production-rebuild-guide.md).

## 1.6 Success criteria
- Clean-month KPIs match the client's embedded spreadsheet totals to the decimal.
- Doubling the event ledger changes **no** KPI.
- Every displayed number is traceable to a cell + hash.
- One-click ALCOA+ audit ZIP (CSVs + SHA-256 manifest).
- Starts blank; only user uploads / manual entry produce data.
- Runs fully on the plant LAN with no outbound data egress (or de-identified only).

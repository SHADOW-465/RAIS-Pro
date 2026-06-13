# D7 — MO!D Application Design Directives (roles, suite architecture, UI)

**Status:** v1.0 directive — extends the master PRD (`moid-prd-extracted.txt` / MO!D PRD v1.0)
and the master plan (`docs/plans/2026-06-11-complete-app-plan.md`). Where this doc and the
PRD differ on *sequencing*, this doc wins: the PRD is the destination, this is the route.
**Context:** no client requirements exist yet; these directives are Seion's best professional
judgment of what an Indian pharma SME plant (GM + PA + QC team) actually needs, designed so
the client *feels* a complete product on day one.

---

## 1. The core judgment call (read this first)

The PRD describes 8 engines + a full Lean suite. A pharma SME will form its opinion of MO!D
in the first 15 minutes of use, on exactly four experiences:

1. "I uploaded our files and it understood them." (ingestion + verification)
2. "It shows ME what I care about." (role-personalized dashboards)
3. "I can trust these numbers." (provenance + findings)
4. "It tells me where I'm losing money." (Pareto + trends + rupee impact)

Everything else (SPC, fishbone, 5-why, FMEA, Kaizen, prediction) is **expansion value, not
adoption value**. Directive: build the four experiences to full polish; *represent* the rest
in the UI as visible locked modules ("coming in your roadmap") so the suite feels big without
being built. A locked module with a one-line promise sells; a half-built module destroys trust.

## 2. Role model (collapse the PRD's 7 roles into 4 for V1)

| V1 Role | Maps to PRD roles | One-line job | Default landing view |
|---|---|---|---|
| **Data Steward** | Operator + Supervisor | Get data in, answer data questions | Upload & Entry workspace + Data-Health queue |
| **Quality Engineer** | Quality Engineer | Find and kill defect causes | Diagnostics workspace (Pareto, trends, drill-down) |
| **Plant Director** | Production Manager + Plant Head + Executive | Decide; report upward | Executive dashboard (KPIs, exceptions, money) |
| **Seion Admin** | Consultant | Configure, onboard, support | Admin console (ontology, rules, users, templates) |

Rationale: an SME plant will not maintain 7 user types; 4 roles cover every real person
(PA = Data Steward, GM = Plant Director, friend/QC head = Quality Engineer, Showmik = Admin).
The RBAC model (§4) supports adding the finer PRD roles later WITHOUT schema change.

## 3. Personalized dashboards — the design mechanic

Directive: personalization is **composition, not duplication**. One widget library; each role
gets a default composition; each USER can pin/hide/reorder widgets (saved to their profile).

- **Widget = (query over canonical events) + (visualization) + (provenance hook).** Every
  widget must support: click-number → lineage trail; filter scope (period/stage/batch/defect
  — the GM's "few rows" requirement is THIS, globally); export (PNG/CSV/their-format).
- **Role defaults:**
  - Data Steward: ingestion status, pending findings count, entry forms, recent uploads,
    "questions answered this month" (the shrinking-questions indicator).
  - Quality Engineer: Pareto (top defects), defect trends, stage-wise rejection %, yield/FPY,
    correlation hints (V2 locked tile), scoped-analysis builder.
  - Plant Director: 4–6 KPI cards (rejection %, yield, top loss in ₹, open exceptions),
    month-vs-month trend, GM authority queue (the few findings needing his call),
    one-click "print monthly report (my format)".
  - Seion Admin: ontology/alias review queue, rulebook editor, user management, template
    editor, ingestion logs.
- **Trust state is global UI law:** every metric badge = verified / assumed-by-rule /
  contains-unresolved. No number renders without a badge. (PRD §22 made executable.)

## 4. Architecture directives

### 4.1 Spine (unchanged, now with roles)
Canonical event store (D1, append-only) remains the single source of truth. Roles NEVER get
different data — they get different *views* and different *write rights* over the same store.

### 4.2 AuthN/AuthZ
- Supabase Auth (or NextAuth + Postgres on-prem) with: `users`, `roles`, `user_roles`,
  `permissions` as data (not code) so new PRD roles are config, not refactor.
- Permission atoms (enforce in API layer, not UI): `ingest:upload`, `entry:write`,
  `findings:adjudicate`, `findings:gm-authority`, `analytics:view`, `reports:print`,
  `admin:ontology`, `admin:rules`, `admin:users`. Role = bundle of atoms.
- Every adjudication/annotation event already records author — extend with `userId` + role at
  time of action (audit trail; pharma data-integrity story).

### 4.3 In-app data collection (the second pipeline, same app, steward role)
- **Forms are generated from the learned ontology**, not hardcoded: a stage's entry form =
  the fields the ingestion engine learned for that stage (checked/accepted/rejected/hold +
  defect breakdown from the defect registry). Admin can adjust; client sees "the system
  already knows our process."
- Direct entries emit the SAME canonical events as Excel ingestion, flagged
  `source: direct-entry` with userId provenance instead of cell provenance. Analytics is
  pipeline-blind. Excel and direct-entry coexist indefinitely (explicit product stance:
  nobody is forced to change workflow).
- Entry UX: tablet-friendly, big targets, per-shift template ("same as yesterday" prefill),
  works on the plant's existing PCs; offline-tolerant draft state (autosave local, sync on
  reconnect) — shop floors have flaky networks.

### 4.4 Module map (PRD engines → build reality)
| PRD engine | V1 (pilot) | V2 | V3+ |
|---|---|---|---|
| Forensic Ingestion + Verification | ✔ full (B1–B2) | | |
| Ontology Engine | ✔ minimal: registries + alias map + admin review queue | learning loop | |
| Event Reconstruction | ✔ (D1 events) | | |
| Knowledge Graph / process graph | implicit (stage registry + handoff edges) | ✔ visual process map | dynamic graph builder |
| Diagnostics (Pareto, trends, yield, scoped analysis) | ✔ full | | |
| SPC | locked tile | ✔ control charts (pharma loves SPC) | |
| Correlation | locked tile | ✔ | |
| Lean suite (fishbone, 5-why) | locked tiles | ✔ assisted (LLM-draft, human-edit) | FMEA, Kaizen gen |
| Financial Intelligence | ✔ **LITE**: admin enters ₹/unit per stage-scrap & rework → every Pareto bar and KPI shows ₹ | full COPQ | ROI engine |
| Recommendation / Poka-Yoke | — | LLM-drafted, clearly labeled "suggestion" | ✔ |
| Predictive | — | — | ✔ |
Financial-lite is pulled INTO V1 deliberately: the GM thinks in rupees; one config table
converts every existing chart into a money chart. Highest sales-value-per-line-of-code in
the entire PRD.

### 4.5 Tech stack (confirm PRD choices, pin decisions)
Next.js + TS + Tailwind + shadcn; Postgres (Supabase hosted for pilot; the schema stays
SQLite/on-prem portable — pharma may demand on-prem later, keep no Supabase-only features in
core paths); Python workers only when analytics outgrow TS (not in V1); LLM behind one
provider-agnostic module (already OpenRouter), used ONLY for semantics/hypotheses/drafts —
all arithmetic deterministic (PRD Principles 1–4 are restated as hard law).

## 5. UI design directives

- **App shell:** left rail navigation by workspace (Dashboard / Diagnostics / Data /
  Reports / Admin), role-filtered; top bar = global scope selector (period, product, stage —
  applies to every widget on screen) + search + user. The scope selector IS the Minitab
  answer; make it permanent and prominent.
- **Design language:** keep the existing RAIS design system (`docs/rais-design-language.md`)
  — clean, high-contrast, print-friendly. Numbers are the heroes: big KPI cards, dense
  tables second, charts always with the underlying table one click away.
- **Locked modules:** real nav entries with a clean explainer card + "available in Phase 2 of
  your rollout" — visible roadmap, zero fake UI.
- **Verification view** stays the signature interaction (beam to source cell); on direct-entry
  data, the beam terminates at the entry record + author + timestamp instead of a cell.
- **Language:** UI English; finding cards/entry forms support Tamil labels as a config toggle
  (decide with client).
- **Print is first-class:** every workspace has a print/PDF action; Plant Director's monthly
  report = their format (D6).
- **Empty states sell:** first-run screens explain what will appear and why it matters — the
  GM's first login should teach him the product without a demo.

## 6. What this changes in the master plan
- D5 (UX spec) absorbs §3/§5 of this doc; add role-default wireframes (4 roles).
- D4 adds §4.2 auth model + §4.3 direct-entry pipeline design.
- B3 gains: auth + RBAC + user management (small, do it when adjudication UI is built —
  adjudication already needs identity).
- B4 gains: widget/composition system + global scope selector + financial-lite (₹ config).
- New B4.5: direct-entry forms (steward role) — AFTER Excel pipeline proves the model, BEFORE
  B5 reports.
- Locked-module shells: trivial; add to B4.
- B6 demo script: add a 90-second role-switch tour (steward enters data → QE drills Pareto →
  GM prints his report) — this IS the "full suite" feeling.

## 7. Open questions to resolve with the client (don't guess)
1. ₹ cost per rejected unit per stage (enables financial-lite; ask in the meeting).
2. On-prem requirement now or acceptable cloud pilot? (affects hosting, not schema)
3. Tamil labels needed for steward screens?
4. Who are the actual named users per role for the pilot (licenses/training)?

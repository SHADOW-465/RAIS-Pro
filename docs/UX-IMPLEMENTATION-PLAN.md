# UX Philosophy — Implementation Plan

**Doctrine:** `docs/UX-PHILOSOPHY.md` **v3**  
**Phase 0 freeze:** `docs/ux/phase-0-spec-freeze.md`  
**Updated:** 2026-07-21 · Phase 0–3 delivered

---

## Acceptance slice

| Priority | Cluster | Status |
|---|---|---|
| P0 | Integrity gate (IG-*) | **Done** |
| P0 | Role × path (RP-*) | **Done** (persona proxy in AppShell) |
| P1 | Investigation object (IO-*) | **Done** (href + apply + recents) |
| P1 | Expert layer (EX-*) | **Done** (Jump palette ⌘K, search, recents) |
| P1 | Decision semantics (DS-*) | **Done** |

---

## Phase 0 — Spec freeze  ✅
## Phase 1 — Integrity gate  ✅
## Phase 2 — Decision surface  ✅

## Phase 3 — Role proxy + expert layer  ✅

### 3a. Environment / persona proxy  ✅
- `src/lib/persona.ts` — operator / supervisor / qe / qa / gm
- AppShell filters `NAV_SECTIONS` by `navAllow`
- Profile control switches role (localStorage `moid_persona`)
- Default: **qe**

### 3b. Investigation recents  ✅
- Already stored by `goInvestigation` / `pushInvestigationRecent`
- Surface in Jump palette as **Recent:** hits

### 3c. Search / jump + palette  ✅
- `src/lib/analytics/search-index.ts` — batch, gate, size, defect, destinations
- `CommandPalette` — Ctrl/⌘K or **Jump** button
- Persona-filtered destinations
- Data Entry reads `?batch=` from palette jump

---

## Done criteria

- [x] Phase 0–3  
- [x] `npx tsc --noEmit` clean  
- [x] Jest green (persona + search tests)  
- [ ] Real auth replacing persona proxy (future)

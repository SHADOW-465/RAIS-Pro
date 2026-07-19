# Phase 1 — Durable Supabase Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the canonical event ledger off the in-RAM memory store onto a durable Supabase/Postgres backend so committed data survives refresh, navigation, HMR, and redeploys.

**Architecture:** The `EventStore`/`FindingStore`/`RulebookStore` interfaces already have a complete `SupabaseEventStore` adapter (`src/lib/store/supabase.ts`), but **no migration ever created the tables it reads/writes**. This phase (1) authors a migration matching the adapter's exact column names/JSON shapes, (2) flips `getStores()` to use Supabase whenever it's configured (memory stays for tests/unconfigured dev), (3) makes the one-time seed run against whatever the active store is, idempotently, and (4) extracts the adapter's row-mapping functions so they can be unit-tested without a network.

**Tech Stack:** Next.js 16 route handlers, `@supabase/supabase-js`, Postgres (Supabase), Jest, Zod canonical contracts (`src/lib/contract/d1`, `d3`).

**Scope note:** This is the standalone keystone phase agreed in the spec (`docs/2026-06-18-data-pipeline-and-charts-design.md`). It ships on its own branch/PR. It does **not** touch parsers, charts, calculations, or the synthetic-seed body — those are phases 2–7. The existing seeder is reused as-is here; only *where it writes* changes.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `supabase/migrations/20260618_canonical_ledger.sql` | DDL for `events`, `findings`, `adjudications`, `rulebook_rules`, `rule_applications` (+ legacy `sessions`/`dashboards` the analyze flow still uses) | Create |
| `src/lib/store/supabase-mappers.ts` | Pure row↔event/finding/rule mapping fns extracted from `supabase.ts` | Create |
| `src/lib/store/supabase.ts` | Import mappers instead of defining them inline | Modify |
| `src/lib/store/index.ts` | Supabase becomes the default when configured; seed runs against the active store | Modify |
| `src/lib/store/__tests__/supabase-mappers.test.ts` | Round-trip tests for the mappers (pure, no network) | Create |
| `src/lib/store/__tests__/store-selector.test.ts` | `shouldUseSupabase()` env-gating test | Create |
| `.env.example` | Document `SUPABASE_SERVICE_ROLE_KEY` + the new default behavior | Modify |

---

## Task 1: Author the canonical ledger migration

**Files:**
- Create: `supabase/migrations/20260618_canonical_ledger.sql`

Column names and JSON columns are taken verbatim from the adapter
(`src/lib/store/supabase.ts`): `SupabaseEventStore` inserts
`event_id, schema_version, ingestion_id, event_type, occurred_on, provenance,
confidence, extracted_by, recorded_at, superseded_by, payload`; findings,
adjudications, rulebook_rules, rule_applications mirror their `mapRowТo*` shapes.

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260618_canonical_ledger.sql
-- Canonical append-only ledger (MOID-SPEC §11). Matches src/lib/store/supabase.ts.
-- All domain detail lives in JSONB `payload`; top-level columns are the envelope.

create extension if not exists "uuid-ossp";

-- 1. Events ledger (append-only; idempotent on event_id content hash) ----------
create table if not exists events (
  event_id        text primary key,
  schema_version  text not null,
  ingestion_id    text not null,
  event_type      text not null,
  occurred_on     jsonb not null,
  provenance      jsonb,
  confidence      jsonb,
  extracted_by    text,
  recorded_at     timestamptz not null default now(),
  superseded_by   text,
  payload         jsonb not null default '{}'::jsonb
);
create index if not exists events_event_type_idx on events (event_type);
create index if not exists events_ingestion_id_idx on events (ingestion_id);

-- 2. Findings ------------------------------------------------------------------
create table if not exists findings (
  finding_id            text primary key,
  schema_version        text not null,
  ingestion_id          text not null,
  rule_id               text,
  subtype               text,
  severity              text not null,
  question              text,
  detail                text,
  evidence              jsonb,
  hypotheses            jsonb,
  requires_gm_authority boolean default false,
  occurred_on           jsonb,
  recorded_at           timestamptz not null default now()
);

-- 3. Adjudications -------------------------------------------------------------
create table if not exists adjudications (
  adjudication_id      text primary key,
  finding_id           text not null references findings(finding_id) on delete cascade,
  verdict              text not null,
  why                  text,
  author               text,
  is_recommendation    boolean default false,
  correction_event_id  text,
  recorded_at          timestamptz not null default now()
);
create index if not exists adjudications_finding_id_idx on adjudications (finding_id);

-- 4. Rulebook rules ------------------------------------------------------------
create table if not exists rulebook_rules (
  rulebook_rule_id          text primary key,
  version                   integer not null,
  status                    text not null,
  predicate                 jsonb,
  action                    jsonb,
  rationale                 text,
  born_from_adjudication_ids jsonb,
  drafted_by                text,
  activated_by              text,
  created_at                timestamptz not null default now(),
  retired_at                timestamptz
);

-- 5. Rule applications ---------------------------------------------------------
create table if not exists rule_applications (
  id                uuid primary key default uuid_generate_v4(),
  rulebook_rule_id  text not null,
  rule_version      integer not null,
  finding_id        text not null,
  ingestion_id      text not null,
  applied_at        timestamptz not null default now()
);
create index if not exists rule_applications_finding_id_idx on rule_applications (finding_id);

-- 6. Legacy editorial analyze flow (kept so /api/sessions keeps working) -------
create table if not exists sessions (
  id          uuid primary key default uuid_generate_v4(),
  status      text default 'processing',
  created_at  timestamptz default now()
);
create table if not exists dashboards (
  id            uuid primary key default uuid_generate_v4(),
  session_id    uuid references sessions(id) on delete cascade,
  analysis_json jsonb not null,
  metadata_json jsonb,
  created_at    timestamptz default now()
);

-- Service-role server client is used (RLS bypassed). No RLS policies here; the
-- app never exposes the anon key to write paths. Revisit when multi-tenant.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260618_canonical_ledger.sql
git commit -m "feat(store): add canonical ledger migration matching supabase adapter"
```

---

## Task 2: Extract the adapter's row-mapping functions (make them testable)

**Files:**
- Create: `src/lib/store/supabase-mappers.ts`
- Modify: `src/lib/store/supabase.ts`
- Test: `src/lib/store/__tests__/supabase-mappers.test.ts`

The mappers (`getPayload`, `mapRowToEvent`, `mapRowToFinding`, `mapRowToRule`) are
currently file-private in `supabase.ts`. Move them to a pure module so they can be
unit-tested without a Supabase client.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/store/__tests__/supabase-mappers.test.ts
import { getPayload, mapRowToEvent } from "../supabase-mappers";
import type { Event } from "../types";

describe("supabase-mappers", () => {
  const event = {
    eventId: "evt-1",
    schemaVersion: "1.0.0",
    ingestionId: "ing-1",
    eventType: "production",
    occurredOn: { kind: "day", start: "2025-04-01", end: "2025-04-01" },
    provenance: { file: "f.xlsx", sheet: "APRIL 25", cells: ["B6"] },
    confidence: { score: 0.9, basis: "heuristic" },
    extractedBy: "heuristic",
    recordedAt: "2026-06-18T00:00:00.000Z",
    supersededBy: null,
    stageId: "visual",
    quantity: 10982,
    unit: "pcs",
    batchNo: null,
    size: null,
  } as unknown as Event;

  it("getPayload strips the envelope, keeping only domain fields", () => {
    const payload = getPayload(event);
    expect(payload).toEqual({
      stageId: "visual",
      quantity: 10982,
      unit: "pcs",
      batchNo: null,
      size: null,
    });
    expect(payload).not.toHaveProperty("eventId");
    expect(payload).not.toHaveProperty("eventType");
  });

  it("round-trips an event through a DB row and back", () => {
    const row = {
      event_id: event.eventId,
      schema_version: event.schemaVersion,
      ingestion_id: event.ingestionId,
      event_type: event.eventType,
      occurred_on: event.occurredOn,
      provenance: event.provenance,
      confidence: event.confidence,
      extracted_by: event.extractedBy,
      recorded_at: event.recordedAt,
      superseded_by: event.supersededBy,
      payload: getPayload(event),
    };
    const back = mapRowToEvent(row);
    expect(back).toEqual(event);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/store/__tests__/supabase-mappers.test.ts`
Expected: FAIL — `Cannot find module '../supabase-mappers'`.

- [ ] **Step 3: Create the mappers module**

```ts
// src/lib/store/supabase-mappers.ts
// Pure row<->domain mappers shared by the Supabase adapter. No client, no I/O —
// so they are unit-testable. The DB stores the canonical envelope as columns and
// all domain-specific fields inside the JSONB `payload`.

import type { Event, FindingT, RulebookRuleT } from "./types";

/** Strip the canonical envelope, leaving only the event-type-specific fields. */
export function getPayload(e: Event): Record<string, unknown> {
  const {
    eventId, schemaVersion, ingestionId, occurredOn, provenance, confidence,
    extractedBy, recordedAt, supersededBy, eventType, ...rest
  } = e as Record<string, unknown> & Event;
  void eventId; void schemaVersion; void ingestionId; void occurredOn;
  void provenance; void confidence; void extractedBy; void recordedAt;
  void supersededBy; void eventType;
  return rest;
}

export function mapRowToEvent(r: any): Event {
  return {
    eventId: r.event_id,
    schemaVersion: r.schema_version,
    ingestionId: r.ingestion_id,
    eventType: r.event_type,
    occurredOn: r.occurred_on,
    provenance: r.provenance,
    confidence: r.confidence,
    extractedBy: r.extracted_by,
    recordedAt: r.recorded_at,
    supersededBy: r.superseded_by,
    ...r.payload,
  } as Event;
}

export function mapRowToFinding(r: any): FindingT {
  return {
    findingId: r.finding_id,
    schemaVersion: r.schema_version,
    ingestionId: r.ingestion_id,
    ruleId: r.rule_id,
    subtype: r.subtype,
    severity: r.severity,
    question: r.question,
    detail: r.detail,
    evidence: r.evidence,
    hypotheses: r.hypotheses,
    requiresGmAuthority: r.requires_gm_authority,
    occurredOn: r.occurred_on,
    recordedAt: r.recorded_at,
  } as FindingT;
}

export function mapRowToRule(r: any): RulebookRuleT {
  return {
    rulebookRuleId: r.rulebook_rule_id,
    version: r.version,
    status: r.status,
    predicate: r.predicate,
    action: r.action,
    rationale: r.rationale,
    bornFromAdjudicationIds: r.born_from_adjudication_ids,
    draftedBy: r.drafted_by,
    activatedBy: r.activated_by,
    createdAt: r.created_at,
    retiredAt: r.retired_at,
  } as RulebookRuleT;
}
```

- [ ] **Step 4: Replace the inline definitions in `supabase.ts` with an import**

In `src/lib/store/supabase.ts`, delete the four functions at the bottom of the
file (`getPayload`, `mapRowToEvent`, `mapRowToFinding`, `mapRowToRule`,
currently lines ~298–352) and add at the top (after the existing type imports,
around line 19):

```ts
import { getPayload, mapRowToEvent, mapRowToFinding, mapRowToRule } from "./supabase-mappers";
```

- [ ] **Step 5: Run tests + typecheck to verify pass**

Run: `npx jest src/lib/store/__tests__/supabase-mappers.test.ts && npx tsc --noEmit`
Expected: tests PASS; no type errors (the adapter still compiles using the imported mappers).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store/supabase-mappers.ts src/lib/store/supabase.ts src/lib/store/__tests__/supabase-mappers.test.ts
git commit -m "refactor(store): extract supabase row mappers + round-trip tests"
```

---

## Task 3: Make Supabase the durable default when configured

**Files:**
- Modify: `src/lib/store/index.ts:36-40` (`shouldUseSupabase`)
- Test: `src/lib/store/__tests__/store-selector.test.ts`

Today `shouldUseSupabase()` returns false unless `MOID_STORE=supabase` is set
explicitly, so the durable store is never used by default — the root cause of
data loss. New rule: use Supabase whenever a URL **and** a key are present, unless
`MOID_STORE=memory` forces memory (tests set this).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/store/__tests__/store-selector.test.ts
import { shouldUseSupabase } from "../index";

describe("shouldUseSupabase", () => {
  const OLD = { ...process.env };
  afterEach(() => { process.env = { ...OLD }; });

  it("is true when URL + a key are present (durable by default)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    delete process.env.MOID_STORE;
    expect(shouldUseSupabase()).toBe(true);
  });

  it("is false when MOID_STORE=memory forces memory (test mode)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.MOID_STORE = "memory";
    expect(shouldUseSupabase()).toBe(false);
  });

  it("is false when no Supabase env is configured", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.MOID_STORE;
    expect(shouldUseSupabase()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/store/__tests__/store-selector.test.ts`
Expected: FAIL — `shouldUseSupabase` is not exported / first case returns false.

- [ ] **Step 3: Update `shouldUseSupabase` and export it**

In `src/lib/store/index.ts`, replace the existing function (lines 36–40):

```ts
/**
 * Durable by default: use Supabase whenever a project URL + a key are present.
 * `MOID_STORE=memory` forces the in-RAM store (tests, throwaway dev). Setting
 * `MOID_STORE=supabase` also works but is no longer required.
 */
export function shouldUseSupabase(): boolean {
  if ((process.env.MOID_STORE || "").toLowerCase() === "memory") return false;
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/store/__tests__/store-selector.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/index.ts src/lib/store/__tests__/store-selector.test.ts
git commit -m "feat(store): use durable Supabase by default when configured"
```

---

## Task 4: Seed once into whichever store is active (idempotent)

**Files:**
- Modify: `src/lib/store/index.ts:42-71` (`getStores`)

Currently `seedStore(events)` is only called in the **memory** branch
(`index.ts:68`). With Supabase as default, a fresh database would show "no data."
Call the existing seeder for **both** backends. It is safe: it early-returns when
`effective().length > 0`, and `append` is idempotent on the event content hash, so
re-running never duplicates. (The seeder *body* — synthetic splits — is replaced in
Phase 2; here we only change where it writes.)

- [ ] **Step 1: Move the seed call so it runs for both branches**

In `getStores()`, change the Supabase branch and the memory branch so `seedStore`
runs against the active event store in both. Replace the body of `getStores()`
(lines 42–71) with:

```ts
export function getStores(): Stores {
  if (g.__moidStores) return g.__moidStores;

  if (shouldUseSupabase()) {
    const {
      SupabaseEventStore,
      SupabaseRulebookStore,
      SupabaseFindingStore,
    } = require("./supabase") as typeof import("./supabase");
    const rulebook = new SupabaseRulebookStore();
    const events = new SupabaseEventStore();
    g.__moidStores = {
      events,
      rulebook,
      findings: new SupabaseFindingStore(rulebook),
      backend: "supabase",
    };
    seedStore(events);
  } else {
    const rulebook = new MemoryRulebookStore();
    const events = new MemoryEventStore();
    g.__moidStores = {
      events,
      rulebook,
      findings: new MemoryFindingStore(rulebook),
      backend: "memory",
    };
    seedStore(events);
  }
  return g.__moidStores;
}
```

- [ ] **Step 2: Widen `seedStore`'s parameter type so it accepts either store**

`seedStore` is typed `(eventsStore: MemoryEventStore)`. It only calls
`.effective()` and `.append()`, both on the `EventStore` interface. Change its
signature (line 73) from:

```ts
function seedStore(eventsStore: MemoryEventStore) {
```

to:

```ts
function seedStore(eventsStore: EventStore) {
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (`EventStore` is already imported in this file via `./types`).

- [ ] **Step 4: Run the full suite to confirm nothing regressed**

Run: `npx jest`
Expected: all existing tests PASS (they run with `MOID_STORE` unset → memory path unaffected, or set memory in jest setup; see Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/store/index.ts
git commit -m "feat(store): seed the active store on first use (durable or memory)"
```

---

## Task 5: Pin tests to the memory store (don't touch the live DB)

**Files:**
- Modify: `jest.config` / setup (locate via `cat package.json | grep -A20 '"jest"'` or `ls jest.*`)

Tests must never hit Supabase. Force `MOID_STORE=memory` for the test
environment so `shouldUseSupabase()` returns false regardless of any `.env`.

- [ ] **Step 1: Find the jest setup file**

Run: `cat package.json | grep -A25 '"jest"'` and `ls jest.setup.* jest.config.* 2>/dev/null`
Note the `setupFiles`/`setupFilesAfterEnv` entry (commonly `jest.setup.ts`).

- [ ] **Step 2: Set the env in the jest setup file**

Add to the top of the existing jest setup file (create `jest.setup.ts` and
register it under `setupFiles` in the jest config if none exists):

```ts
// Force the in-memory store for all tests — never touch a live Supabase project.
process.env.MOID_STORE = "memory";
```

- [ ] **Step 3: Run the full suite**

Run: `npx jest`
Expected: all tests PASS; `store-selector.test.ts` still passes because it sets
env vars explicitly inside each test (overriding the global default per-case).

- [ ] **Step 4: Commit**

```bash
git add jest.setup.ts jest.config.* package.json
git commit -m "test(store): force memory backend in the jest environment"
```

---

## Task 6: Apply the migration and verify durability live

**Files:** none (operational + manual verification)

- [ ] **Step 1: Ensure env is configured**

Confirm `.env.local` has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
and `SUPABASE_SERVICE_ROLE_KEY`. If missing, ask the user for the service-role key
(it is required for server-side writes; the anon key triggers RLS).

- [ ] **Step 2: Apply the migration to the Supabase project**

Preferred (Supabase MCP): apply `supabase/migrations/20260618_canonical_ledger.sql`
via the `apply_migration` tool (name `canonical_ledger`).
Fallback (CLI, if linked): `npx supabase db push`.
Verify with `list_tables` (MCP) or a `select` that `events`, `findings`,
`adjudications`, `rulebook_rules`, `rule_applications` exist.

- [ ] **Step 3: Start the app and confirm the backend**

Run the dev server (preview_start). Hit `GET /api/events` and confirm the JSON
response includes `"backend":"supabase"` and a non-zero `count` (seed ran).

- [ ] **Step 4: Verify durability (the actual bug)**

Using the preview workflow:
1. Load the dashboard — note the rejection-rate / total-rejections values.
2. Reload the page (`window.location.reload()`), navigate to `/staging` and back.
3. Confirm the same values persist and the dashboard does **not** say "no data."
4. Commit one manual entry via Data Entry; reload; confirm it is still present.
Capture a screenshot of the populated dashboard after reload as evidence.

- [ ] **Step 5: Verify in the DB**

Run a `select count(*) from events;` (MCP `execute_sql`) and confirm it matches the
`/api/events` count. Confirms writes are durable, not in RAM.

---

## Task 7: Branch, document, and open the Phase 1 PR

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Confirm work is on its own branch**

This phase ships separately. If not already branched off `moid-v1`:

```bash
git checkout -b feat/phase1-durable-ledger
```

(If tasks 1–6 were committed on `moid-v1`, create the branch now — it carries those commits.)

- [ ] **Step 2: Document the durable-by-default behavior in `.env.example`**

Add under the Supabase block in `.env.example`:

```bash
# The canonical ledger uses Supabase automatically when URL + a key are set.
# Server-side writes need the service-role key (anon key hits RLS):
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Force the in-RAM store instead (throwaway dev / tests): MOID_STORE=memory
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(env): document durable-by-default Supabase ledger"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/phase1-durable-ledger
gh pr create --base main --title "Phase 1: durable Supabase ledger (fixes data-vanishes bug)" \
  --body "Implements Phase 1 of docs/2026-06-18-data-pipeline-and-charts-design.md: canonical ledger migration + Supabase as the durable default. Fixes #5/6/7 (data vanishes on refresh) and unblocks the manual-vs-Excel reconcile work. Phases 2–7 follow."
```

---

## Self-review notes (coverage vs spec Phase 1)

- **#5,6,7 (data vanishes):** Tasks 1 (tables exist) + 3 (Supabase default) + 6
  (verify durability) — covered.
- **Unblocks #18,19,23,25:** durable store means the Excel seed + manual entries
  coexist; the merge/reconcile logic itself is Phase 2 (out of scope here, noted).
- **Seed not empty:** Task 4 ensures the dashboard isn't blank on a fresh DB.
- **No live-DB in tests:** Task 5.
- **Adapter correctness:** Task 2 round-trip tests guard the JSON mapping the
  migration relies on.
- **No placeholders:** every code/SQL step is complete; commands have expected output.

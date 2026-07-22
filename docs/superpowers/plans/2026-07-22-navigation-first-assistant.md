# Navigation-First Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a typed request ("why did rejection spike in April") into the app auto-opening the correct screen, scoped and with the relevant KPI highlighted, using deterministic parsing with an LLM fallback only on low-confidence misses.

**Architecture:** One new pure resolver (`intent.ts`) fills scope slots (date, metric, gate, size, batch) from the request by matching against the live entity sets `search-index.ts` already builds. On a confident parse the existing `goInvestigation()` navigates; on an ambiguous one the existing CommandPalette pick-list shows. MiniCPM (fast) only rescues low-confidence parses and its output is reconciled against real entities. No metric is ever computed by the model.

**Tech Stack:** TypeScript, Next.js 16 / React 19, Jest (`ts-jest`), AI SDK v6 via `tryModels` (MiniCPM primary, Groq fallback).

## Global Constraints

- **Firewall:** v1 computes no metric value. It only routes to screens that already compute deterministically. No number originates from the model.
- **Offline-safe:** navigation must work with all AI backends down (deterministic parse or pick-list). The LLM is never on the critical path.
- **Pure lib code:** files in `src/lib/analytics/*` are pure functions — no React, no I/O, no `window`. Client-only helpers go in components.
- **Design system:** UI uses CSS variables (`--surface`, `--border`, `--accent`, `--text`, `--text-3`, `--radius-*`, `--shadow-*`), inline `style={{}}`, no new Tailwind utility classes, no new deps.
- **Persona gate:** never auto-navigate to a screen the current persona can't see (`personaAllowsNav`).
- **Test style:** Jest, tests in `src/lib/analytics/__tests__/*.test.ts`, `assert`-free (`expect().toBe/toEqual`). Run with `npx jest <path>`.
- **Branch:** all work on a feature branch (`feat/nav-first-assistant`), not `main`. Conventional-commit messages ending with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch**

Run:
```bash
git checkout -b feat/nav-first-assistant
```

- [ ] **Step 2: Commit the approved spec (already written)**

```bash
git add docs/superpowers/specs/2026-07-22-navigation-first-assistant-design.md \
        docs/superpowers/plans/2026-07-22-navigation-first-assistant.md
git commit -m "docs: navigation-first assistant spec + plan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 1: Date-phrase parser

Parses a period phrase into `{from,to,grain}`, anchored on the data's latest
date (never a hardcoded today). Isolated because date parsing is the highest
bug-risk piece.

**Files:**
- Create: `src/lib/analytics/date-phrase.ts`
- Test: `src/lib/analytics/__tests__/date-phrase.test.ts`

**Interfaces:**
- Consumes: `Grain`, `periodKey`, `fyContaining` from `./scope`.
- Produces:
  ```ts
  export interface DatePhrase { from: string; to: string; grain: Grain; matchedText: string; }
  export function parseDatePhrase(text: string, dataMaxIso: string): DatePhrase | null;
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/analytics/__tests__/date-phrase.test.ts`:
```ts
import { parseDatePhrase } from "../date-phrase";

const MAX = "2025-08-15"; // data's latest date; FY = Apr 2025 – Mar 2026

describe("parseDatePhrase", () => {
  it("resolves a bare month to its most recent occurrence at/before dataMax", () => {
    expect(parseDatePhrase("rejection in April", MAX)).toEqual({
      from: "2025-04-01", to: "2025-04-30", grain: "month", matchedText: "april",
    });
  });

  it("resolves a month that hasn't happened yet this year to last year", () => {
    // December is after August 2025 → most recent December is 2024
    expect(parseDatePhrase("December scrap", MAX)).toMatchObject({
      from: "2024-12-01", to: "2024-12-31", grain: "month",
    });
  });

  it("resolves 'this fy' to Apr–Mar around dataMax", () => {
    expect(parseDatePhrase("copq this fy", MAX)).toEqual({
      from: "2025-04-01", to: "2026-03-31", grain: "fy", matchedText: "this fy",
    });
  });

  it("resolves 'last 90 days' relative to dataMax", () => {
    expect(parseDatePhrase("defects last 90 days", MAX)).toMatchObject({
      from: "2025-05-17", to: "2025-08-15", grain: "day",
    });
  });

  it("resolves 'last month'", () => {
    expect(parseDatePhrase("last month", MAX)).toMatchObject({
      from: "2025-07-01", to: "2025-07-31", grain: "month",
    });
  });

  it("returns null when no period phrase is present", () => {
    expect(parseDatePhrase("balloon gate defects", MAX)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/analytics/__tests__/date-phrase.test.ts`
Expected: FAIL — "Cannot find module '../date-phrase'".

- [ ] **Step 3: Write the implementation**

`src/lib/analytics/date-phrase.ts`:
```ts
// Parse a natural period phrase into {from,to,grain}. Pure. Anchored on the
// data's latest date so "last 90 days" lands on real data (never a wall clock).
import type { Grain } from "./scope";

export interface DatePhrase {
  from: string;
  to: string;
  grain: Grain;
  matchedText: string;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

export function parseDatePhrase(text: string, dataMaxIso: string): DatePhrase | null {
  const t = text.toLowerCase();
  const [my, mm] = dataMaxIso.split("-").map(Number);

  // "this fy" / "this financial year" / "this year"
  if (/\bthis (fy|financial year|fiscal year|year)\b/.test(t)) {
    const startYear = mm >= 4 ? my : my - 1;
    return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31`, grain: "fy", matchedText: "this fy" };
  }

  // "last N days"
  const days = t.match(/\blast (\d{1,3}) days?\b/);
  if (days) {
    const n = Number(days[1]);
    const end = new Date(`${dataMaxIso}T00:00:00Z`);
    const start = new Date(end.getTime() - n * 86_400_000);
    return {
      from: start.toISOString().slice(0, 10),
      to: dataMaxIso,
      grain: "day",
      matchedText: days[0],
    };
  }

  // "last month" / "this month"
  if (/\blast month\b/.test(t)) {
    const y = mm === 1 ? my - 1 : my;
    const m = mm === 1 ? 12 : mm - 1;
    return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)), grain: "month", matchedText: "last month" };
  }
  if (/\bthis month\b/.test(t)) {
    return { from: iso(my, mm, 1), to: iso(my, mm, lastDay(my, mm)), grain: "month", matchedText: "this month" };
  }

  // "last quarter" — the 3 calendar months ending in the month before dataMax's quarter
  if (/\blast quarter\b/.test(t)) {
    const qEndMonth = (Math.ceil(mm / 3) - 1) * 3; // 0 if in Q1
    const endM = qEndMonth === 0 ? 12 : qEndMonth;
    const endY = qEndMonth === 0 ? my - 1 : my;
    const startM = ((endM - 3 + 12) % 12) + 1;
    const startY = endM - 3 <= 0 ? endY - 1 : endY;
    return { from: iso(startY, startM, 1), to: iso(endY, endM, lastDay(endY, endM)), grain: "month", matchedText: "last quarter" };
  }

  // Bare month name → most recent occurrence at/before dataMax
  for (let i = 0; i < MONTHS.length; i++) {
    const re = new RegExp(`\\b${MONTHS[i]}\\b`);
    if (re.test(t)) {
      const monthNo = i + 1;
      const year = monthNo <= mm ? my : my - 1;
      return {
        from: iso(year, monthNo, 1),
        to: iso(year, monthNo, lastDay(year, monthNo)),
        grain: "month",
        matchedText: MONTHS[i],
      };
    }
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/analytics/__tests__/date-phrase.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/date-phrase.ts src/lib/analytics/__tests__/date-phrase.test.ts
git commit -m "feat: date-phrase parser for intent scope

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shared match helper + metric glossary + routing table

Extract the entity/score logic from `search-index.ts` so intent and the palette
share one implementation, and add the metric→screen map.

**Files:**
- Create: `src/lib/analytics/intent-vocab.ts`
- Modify: `src/lib/analytics/search-index.ts` (re-export the shared helper; add `answersMetric`)
- Test: `src/lib/analytics/__tests__/intent-vocab.test.ts`

**Interfaces:**
- Consumes: `Event` from `@/lib/store/types`, `NavKey` from `@/lib/nav-keys`.
- Produces:
  ```ts
  export interface EntitySets { batches: Set<string>; stages: Set<string>; sizes: Set<string>; defects: Set<string>; }
  export function buildEntitySets(events: Event[]): EntitySets;
  export function scoreMatch(query: string, ...fields: string[]): number;
  export function matchMetric(text: string): string | null;         // "defect" | "copq" | "fpy" | "size" | "stage" | "rate" | null
  export const METRIC_SCREEN: Record<string, NavKey>;
  export function screenForMetric(metric: string): NavKey | null;
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/analytics/__tests__/intent-vocab.test.ts`:
```ts
import { buildEntitySets, scoreMatch, matchMetric, screenForMetric } from "../intent-vocab";
import type { Event } from "@/lib/store/types";

const ev = (over: Partial<Event>) => over as unknown as Event;

describe("buildEntitySets", () => {
  it("collects distinct stages, sizes, defects from events", () => {
    const sets = buildEntitySets([
      ev({ eventType: "rejection", stageId: "balloon", size: "24Fr", defectCode: "PINHOLE" }),
      ev({ eventType: "rejection", stageId: "visual", size: "24Fr", defectCode: "CRACK" }),
    ]);
    expect([...sets.stages].sort()).toEqual(["balloon", "visual"]);
    expect([...sets.sizes]).toEqual(["24Fr"]);
    expect([...sets.defects].sort()).toEqual(["CRACK", "PINHOLE"]);
  });
});

describe("matchMetric", () => {
  it.each([
    ["rejection spike", "defect"],
    ["what's our scrap", "defect"],
    ["copq this month", "copq"],
    ["cost of poor quality", "copq"],
    ["fpy trend", "fpy"],
    ["yield last quarter", "fpy"],
    ["rejection rate", "rate"],
    ["nothing here", null],
  ])("maps %s -> %s", (text, expected) => {
    expect(matchMetric(text)).toBe(expected);
  });
});

describe("screenForMetric", () => {
  it("routes metrics to nav keys", () => {
    expect(screenForMetric("defect")).toBe("defect");
    expect(screenForMetric("copq")).toBe("copq");
    expect(screenForMetric("fpy")).toBe("process-flow");
    expect(screenForMetric("size")).toBe("size");
    expect(screenForMetric("stage")).toBe("stage");
    expect(screenForMetric("rate")).toBe("stage");
  });
});

describe("scoreMatch", () => {
  it("scores exact > prefix > substring", () => {
    expect(scoreMatch("balloon", "balloon")).toBe(1);
    expect(scoreMatch("ball", "balloon")).toBeCloseTo(0.9);
    expect(scoreMatch("loon", "balloon")).toBeCloseTo(0.7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/analytics/__tests__/intent-vocab.test.ts`
Expected: FAIL — "Cannot find module '../intent-vocab'".

- [ ] **Step 3: Write `intent-vocab.ts`**

`src/lib/analytics/intent-vocab.ts`:
```ts
// Shared matching vocabulary for intent + command palette. Pure.
import type { Event } from "@/lib/store/types";
import type { NavKey } from "@/lib/nav-keys";

export interface EntitySets {
  batches: Set<string>;
  stages: Set<string>;
  sizes: Set<string>;
  defects: Set<string>;
}

function batchOf(e: Event): string {
  const cf = (e as { customFields?: Record<string, unknown> }).customFields;
  const b = cf?.batch ?? cf?.batchId ?? (e as { batchNo?: string | null }).batchNo;
  return typeof b === "string" ? b.trim() : "";
}
function stageOf(e: Event): string | null {
  return "stageId" in e ? ((e as { stageId?: string }).stageId ?? null) : null;
}
function sizeOf(e: Event): string | null {
  return "size" in e ? ((e as { size?: string | null }).size ?? null) : null;
}
function defectOf(e: Event): string | null {
  if (e.eventType !== "rejection") return null;
  const raw =
    (e as { defectCodeRaw?: string }).defectCodeRaw ||
    (e as { defectCode?: string }).defectCode;
  return raw ? String(raw) : null;
}

export function buildEntitySets(events: Event[]): EntitySets {
  const sets: EntitySets = { batches: new Set(), stages: new Set(), sizes: new Set(), defects: new Set() };
  for (const e of events) {
    const b = batchOf(e); if (b) sets.batches.add(b);
    const st = stageOf(e); if (st) sets.stages.add(st);
    const sz = sizeOf(e); if (sz) sets.sizes.add(sz);
    const df = defectOf(e); if (df) sets.defects.add(df);
  }
  return sets;
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Exact 1 > prefix 0.9 > substring 0.7 > all-words 0.55 > 0.5 empty query. */
export function scoreMatch(query: string, ...fields: string[]): number {
  if (!query) return 0.5;
  const q = norm(query);
  let best = 0;
  for (const f of fields) {
    const t = norm(f);
    if (!t) continue;
    if (t === q) best = Math.max(best, 1);
    else if (t.startsWith(q)) best = Math.max(best, 0.9);
    else if (t.includes(q)) best = Math.max(best, 0.7);
    else if (q.split(/\s+/).every((w) => w && t.includes(w))) best = Math.max(best, 0.55);
  }
  return best;
}

// Metric synonym glossary. Order matters: "rate" must be checked before the
// generic "rejection" → defect fallback so "rejection rate" resolves to rate.
const METRIC_SYNONYMS: Array<[string, RegExp]> = [
  ["rate", /\b(rejection rate|reject rate|\brate\b)\b/],
  ["copq", /\b(copq|cost of poor quality|\bcost\b|rupees?|savings)\b/],
  ["fpy", /\b(fpy|first pass yield|\byield\b)\b/],
  ["size", /\b(size|french|\bfr\b)\b/],
  ["stage", /\b(stage|gate|checkpoint|inspection point)\b/],
  ["defect", /\b(defect|reject|rejection|nonconformance|non-conformance|\bnc\b|scrap)\b/],
];

export function matchMetric(text: string): string | null {
  const t = text.toLowerCase();
  for (const [metric, re] of METRIC_SYNONYMS) {
    if (re.test(t)) return metric;
  }
  return null;
}

export const METRIC_SCREEN: Record<string, NavKey> = {
  defect: "defect",
  copq: "copq",
  fpy: "process-flow",
  size: "size",
  stage: "stage",
  rate: "stage",
};

export function screenForMetric(metric: string): NavKey | null {
  return METRIC_SCREEN[metric] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/analytics/__tests__/intent-vocab.test.ts`
Expected: PASS.

- [ ] **Step 5: Point `search-index.ts` at the shared helpers**

In `src/lib/analytics/search-index.ts`, remove the local `scoreMatch`, `batchOf`,
`stageOf`, `sizeOf`, `defectOf`, `norm` definitions and import the shared ones so
the two paths cannot drift. At the top, add:
```ts
import { buildEntitySets, scoreMatch } from "./intent-vocab";
```
Replace the per-set `for (const e of input.events) { ... }` block that fills
`batches/stages/sizes/defects` with:
```ts
const { batches, stages, sizes, defects } = buildEntitySets(input.events);
```
Leave the rest of `searchJumpTargets` unchanged.

- [ ] **Step 6: Verify the palette test still passes**

Run: `npx jest src/lib/__tests__/persona-search.test.ts`
Expected: PASS (no behavior change — same scoring, same sets).

- [ ] **Step 7: Commit**

```bash
git add src/lib/analytics/intent-vocab.ts \
        src/lib/analytics/__tests__/intent-vocab.test.ts \
        src/lib/analytics/search-index.ts
git commit -m "refactor: shared match vocab + metric routing for intent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `resolveIntentDeterministic`

The deterministic core of the resolver — no LLM yet.

**Files:**
- Create: `src/lib/analytics/intent.ts`
- Test: `src/lib/analytics/__tests__/intent.test.ts`

**Interfaces:**
- Consumes: `parseDatePhrase` (Task 1); `buildEntitySets`, `scoreMatch`,
  `matchMetric`, `screenForMetric` (Task 2); `InvestigationState` from
  `./investigation-state`; `SearchHit`, `searchJumpTargets` from `./search-index`;
  `PersonaId`, `personaAllowsNav` from `@/lib/persona`; `NavKey` from
  `@/lib/nav-keys`; `Event` from `@/lib/store/types`.
- Produces:
  ```ts
  export interface IntentCtx {
    events: Event[];
    currentScope: InvestigationState;
    persona: PersonaId;
    dataMaxIso: string; // latest event date, for date-phrase anchoring
  }
  export interface IntentResult {
    state: InvestigationState;
    navKey: NavKey;
    highlights: string[];
    confidence: number;
    matched: { period?: string; metric?: string; stage?: string; size?: string; batch?: string; defect?: string };
    alternatives: SearchHit[];
  }
  export const CONFIDENT = 0.5;
  export function resolveIntentDeterministic(text: string, ctx: IntentCtx): IntentResult;
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/analytics/__tests__/intent.test.ts`:
```ts
import { resolveIntentDeterministic, CONFIDENT, type IntentCtx } from "../intent";
import type { Event } from "@/lib/store/types";

const ev = (over: Partial<Event>) => over as unknown as Event;
const EVENTS: Event[] = [
  ev({ eventType: "rejection", stageId: "balloon", size: "24Fr", defectCode: "PINHOLE" }),
  ev({ eventType: "rejection", stageId: "visual", size: "22Fr", defectCode: "CRACK" }),
];
const baseCtx = (persona: IntentCtx["persona"] = "qe"): IntentCtx => ({
  events: EVENTS,
  currentScope: { grain: "month" },
  persona,
  dataMaxIso: "2025-08-15",
});

describe("resolveIntentDeterministic", () => {
  it("routes 'rejection in April' to defect analysis, scoped to April", () => {
    const r = resolveIntentDeterministic("rejection in April", baseCtx());
    expect(r.navKey).toBe("defect");
    expect(r.state).toMatchObject({ grain: "month", from: "2025-04-01", to: "2025-04-30", metric: "defect" });
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENT);
    expect(r.highlights).toContain("defect");
  });

  it("routes a matched gate to stage analysis", () => {
    const r = resolveIntentDeterministic("balloon gate problems", baseCtx());
    expect(r.navKey).toBe("stage");
    expect(r.state.stage).toBe("balloon");
    expect(r.matched.stage).toBe("balloon");
  });

  it("routes a matched size to size analysis", () => {
    const r = resolveIntentDeterministic("24Fr issues", baseCtx());
    expect(r.navKey).toBe("size");
    expect(r.state.size).toBe("24Fr");
  });

  it("routes copq to the copq screen", () => {
    const r = resolveIntentDeterministic("copq this fy", baseCtx());
    expect(r.navKey).toBe("copq");
    expect(r.state).toMatchObject({ grain: "fy", metric: "copq" });
  });

  it("does not route an operator to a screen their role can't see", () => {
    const r = resolveIntentDeterministic("copq this fy", baseCtx("operator"));
    // operator navAllow = ["dashboard","data-entry"] → copq denied
    expect(["dashboard", "data-entry"]).toContain(r.navKey);
    expect(r.confidence).toBeLessThan(CONFIDENT);
  });

  it("returns alternatives when nothing confident matches", () => {
    const r = resolveIntentDeterministic("what should I look at", baseCtx());
    expect(r.confidence).toBeLessThan(CONFIDENT);
    expect(r.alternatives.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/analytics/__tests__/intent.test.ts`
Expected: FAIL — "Cannot find module '../intent'".

- [ ] **Step 3: Write `intent.ts` (deterministic path)**

`src/lib/analytics/intent.ts`:
```ts
// Deterministic-first intent resolver. Pure. Turns a request into a scoped
// navigation target. The LLM fallback is added in Task 4 (resolveIntent).
import type { Event } from "@/lib/store/types";
import type { NavKey } from "@/lib/nav-keys";
import { type PersonaId, personaAllowsNav } from "@/lib/persona";
import type { InvestigationState } from "./investigation-state";
import { type SearchHit, searchJumpTargets } from "./search-index";
import { PERSONAS } from "@/lib/persona";
import { parseDatePhrase } from "./date-phrase";
import {
  buildEntitySets,
  scoreMatch,
  matchMetric,
  screenForMetric,
} from "./intent-vocab";

export const CONFIDENT = 0.5;

export interface IntentCtx {
  events: Event[];
  currentScope: InvestigationState;
  persona: PersonaId;
  dataMaxIso: string;
}

export interface IntentResult {
  state: InvestigationState;
  navKey: NavKey;
  highlights: string[];
  confidence: number;
  matched: { period?: string; metric?: string; stage?: string; size?: string; batch?: string; defect?: string };
  alternatives: SearchHit[];
}

const NAV_HREF: Record<NavKey, string> = {
  dashboard: "/", workbooks: "/workbooks", "data-entry": "/data-entry",
  staging: "/staging", stage: "/stage-analysis", size: "/size-analysis",
  defect: "/defect-analysis", spc: "/spc", "process-flow": "/process-flow",
  copq: "/copq", reports: "/reports", capa: "/capa", ask: "/chat",
  audit: "/audit", schema: "/schema", settings: "/settings", "clear-data": "/clear-data",
};

/** Best fuzzy match of the query against a live entity set (>= 0.7 to count). */
function bestEntity(text: string, set: Set<string>): { value: string; score: number } | null {
  let best: { value: string; score: number } | null = null;
  for (const v of set) {
    const s = scoreMatch(text, v);
    if (s >= 0.7 && (!best || s > best.score)) best = { value: v, score: s };
  }
  // also try each whitespace token so "24Fr issues" matches "24Fr"
  for (const tok of text.split(/\s+/)) {
    for (const v of set) {
      const s = scoreMatch(tok, v);
      if (s >= 0.9 && (!best || s > best.score)) best = { value: v, score: s };
    }
  }
  return best;
}

export function resolveIntentDeterministic(text: string, ctx: IntentCtx): IntentResult {
  const sets = buildEntitySets(ctx.events);
  const matched: IntentResult["matched"] = {};

  const state: InvestigationState = { grain: ctx.currentScope.grain ?? "month" };
  let score = 0;

  // Period
  const period = parseDatePhrase(text, ctx.dataMaxIso);
  if (period) {
    state.grain = period.grain;
    state.from = period.from;
    state.to = period.to;
    matched.period = period.matchedText;
    score += 0.3;
  }

  // Specific entities take routing priority over a generic metric.
  const stage = bestEntity(text, sets.stages);
  const size = bestEntity(text, sets.sizes);
  const defect = bestEntity(text, sets.defects);
  const batch = bestEntity(text, sets.batches);

  let navKey: NavKey | null = null;
  const highlights: string[] = [];

  const metric = matchMetric(text);
  if (metric) { matched.metric = metric; state.metric = metric; highlights.push(metric); score += 0.4; }

  if (defect) { matched.defect = defect.value; navKey = "defect"; state.metric = "defect"; score = Math.max(score, defect.score); }
  else if (stage) { matched.stage = stage.value; state.stage = stage.value; navKey = "stage"; score = Math.max(score, stage.score); }
  else if (size) { matched.size = size.value; state.size = size.value; navKey = "size"; score = Math.max(score, size.score); }
  else if (batch) { matched.batch = batch.value; state.batch = batch.value; navKey = "data-entry"; score = Math.max(score, batch.score); }
  else if (metric) { navKey = screenForMetric(metric); }
  else if (period) { navKey = "dashboard"; }

  // Persona gate: if the natural target is denied, drop confidence and fall to
  // the persona's home so we never auto-open a forbidden screen.
  if (navKey && !personaAllowsNav(ctx.persona, navKey)) {
    navKey = null;
    score = Math.min(score, CONFIDENT - 0.01);
  }
  if (!navKey) {
    navKey = personaAllowsNav(ctx.persona, "dashboard") ? "dashboard" : "data-entry";
    score = Math.min(score, CONFIDENT - 0.01);
  }

  if (state.metric && !highlights.includes(state.metric)) highlights.push(state.metric);

  const confident = score >= CONFIDENT;
  const alternatives = confident
    ? []
    : searchJumpTargets(text, { events: ctx.events, allowedNavKeys: PERSONAS[ctx.persona].navAllow });

  return { state, navKey, highlights, confidence: Math.min(score, 1), matched, alternatives };
}

/** Href for a resolved result (scope carried as query params — see Task 5). */
export function hrefForNav(navKey: NavKey): string {
  return NAV_HREF[navKey];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/analytics/__tests__/intent.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/intent.ts src/lib/analytics/__tests__/intent.test.ts
git commit -m "feat: deterministic intent resolver

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: LLM fallback with reconciliation

Add the async `resolveIntent` that runs the deterministic path first and only
calls MiniCPM (fast) when confidence is low, reconciling the model's slots
against real entities before re-scoring.

**Files:**
- Modify: `src/lib/analytics/intent.ts`
- Modify: `src/lib/analytics/__tests__/intent.test.ts` (add reconcile test with a mocked extractor)

**Interfaces:**
- Consumes: `resolveIntentDeterministic` (Task 3).
- Produces:
  ```ts
  export type SlotExtractor = (text: string) => Promise<Partial<Record<"period"|"metric"|"stage"|"size"|"batch", string>>>;
  export async function resolveIntent(text: string, ctx: IntentCtx, extract?: SlotExtractor): Promise<IntentResult>;
  ```
  `extract` is injectable so tests never touch a live model; production passes
  the `tryModels`-backed extractor.

- [ ] **Step 1: Write the failing test (append to intent.test.ts)**

```ts
import { resolveIntent } from "../intent";

describe("resolveIntent (LLM fallback)", () => {
  it("uses the extractor on low-confidence and reconciles against real entities", async () => {
    // "we slipped last period on the balloon step" — deterministic misses the
    // gate word ("step"), so the extractor supplies stage=balloon.
    const extract = async () => ({ stage: "balloon", metric: "defect", size: "99Fr" /* hallucinated */ });
    const r = await resolveIntent("we slipped on the balloon step", baseCtx(), extract);
    expect(r.state.stage).toBe("balloon");   // real entity kept
    expect(r.state.size).toBeUndefined();     // hallucinated 99Fr dropped
    expect(r.navKey).toBe("stage");
  });

  it("does NOT call the extractor when the deterministic parse is already confident", async () => {
    let called = false;
    const extract = async () => { called = true; return {}; };
    await resolveIntent("rejection in April", baseCtx(), extract);
    expect(called).toBe(false);
  });

  it("falls back to the deterministic result if the extractor throws (AI down)", async () => {
    const extract = async () => { throw new Error("all backends failed"); };
    const r = await resolveIntent("what should I look at", baseCtx(), extract);
    expect(r.alternatives.length).toBeGreaterThan(0); // graceful pick-list
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/analytics/__tests__/intent.test.ts -t "LLM fallback"`
Expected: FAIL — `resolveIntent` is not exported.

- [ ] **Step 3: Add `resolveIntent` + reconciliation to `intent.ts`**

Append to `src/lib/analytics/intent.ts`:
```ts
export type SlotExtractor = (
  text: string,
) => Promise<Partial<Record<"period" | "metric" | "stage" | "size" | "batch", string>>>;

/** Rebuild the request text with reconciled slots, then re-run the deterministic
 *  resolver. Only slots that exist in the real entity sets survive. */
export async function resolveIntent(
  text: string,
  ctx: IntentCtx,
  extract?: SlotExtractor,
): Promise<IntentResult> {
  const first = resolveIntentDeterministic(text, ctx);
  if (first.confidence >= CONFIDENT || !extract) return first;

  let slots: Awaited<ReturnType<SlotExtractor>>;
  try {
    slots = await extract(text);
  } catch {
    return first; // AI down → deterministic result (pick-list)
  }

  const sets = buildEntitySets(ctx.events);
  const inSet = (v: string | undefined, set: Set<string>) =>
    v && [...set].some((x) => x.toLowerCase() === v.toLowerCase())
      ? [...set].find((x) => x.toLowerCase() === v!.toLowerCase())
      : undefined;

  // Reconcile: keep only real values; re-inject them as plain words so the
  // deterministic resolver scores them normally.
  const parts: string[] = [text];
  const stage = inSet(slots.stage, sets.stages); if (stage) parts.push(stage);
  const size = inSet(slots.size, sets.sizes); if (size) parts.push(size);
  const batch = inSet(slots.batch, sets.batches); if (batch) parts.push(batch);
  if (slots.metric) parts.push(slots.metric);
  if (slots.period) parts.push(slots.period);

  const second = resolveIntentDeterministic(parts.join(" "), ctx);
  return second.confidence >= first.confidence ? second : first;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/analytics/__tests__/intent.test.ts`
Expected: PASS (all deterministic + fallback tests).

- [ ] **Step 5: Create the production extractor (wired to `tryModels`)**

Create `src/lib/analytics/intent-llm.ts`:
```ts
// Production SlotExtractor: MiniCPM (fast) via the provider chain. Flat string
// slots only — sized for a 1B model. Never used in unit tests.
import { generateObject } from "ai";
import { z } from "zod";
import { tryModels } from "@/lib/ai";
import type { SlotExtractor } from "./intent";

const SlotSchema = z.object({
  period: z.string().nullable(),
  metric: z.string().nullable(),
  stage: z.string().nullable(),
  size: z.string().nullable(),
  batch: z.string().nullable(),
});

export const llmSlotExtractor: SlotExtractor = async (text) => {
  const { object } = await tryModels(
    (model) =>
      generateObject({
        model,
        schema: SlotSchema,
        system:
          "Extract quality-analytics filters from the question. Return null for any " +
          "field not clearly mentioned. Do not invent values.",
        prompt: `Question: ${text}`,
        temperature: 0,
        maxRetries: 1,
      }),
    { fast: true },
  );
  return {
    period: object.period ?? undefined,
    metric: object.metric ?? undefined,
    stage: object.stage ?? undefined,
    size: object.size ?? undefined,
    batch: object.batch ?? undefined,
  };
};
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/intent.ts src/lib/analytics/intent-llm.ts \
        src/lib/analytics/__tests__/intent.test.ts
git commit -m "feat: LLM slot-extraction fallback with entity reconciliation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Carry `highlight` in InvestigationState

Add the optional `highlight` field so the resolved KPI to spotlight rides in the
URL like every other scope field.

**Files:**
- Modify: `src/lib/analytics/investigation-state.ts`
- Test: `src/lib/analytics/__tests__/investigation-highlight.test.ts`

**Interfaces:**
- Produces: `InvestigationState.highlight?: string` round-trips through
  `serializeInvestigationState` / `parseInvestigationState`.

- [ ] **Step 1: Write the failing test**

`src/lib/analytics/__tests__/investigation-highlight.test.ts`:
```ts
import { serializeInvestigationState, parseInvestigationState } from "../investigation-state";

it("round-trips the highlight field", () => {
  const q = serializeInvestigationState({ grain: "month", metric: "defect", highlight: "defect" });
  expect(q.get("highlight")).toBe("defect");
  expect(parseInvestigationState(q).highlight).toBe("defect");
});

it("omits highlight when absent", () => {
  const q = serializeInvestigationState({ grain: "month" });
  expect(q.has("highlight")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/analytics/__tests__/investigation-highlight.test.ts`
Expected: FAIL — `highlight` not on the type / not serialized.

- [ ] **Step 3: Add the field**

In `src/lib/analytics/investigation-state.ts`:
- Add to the `InvestigationState` interface, after `metric?`:
  ```ts
  /** KPI/chart id to spotlight on arrival (v1: a metric key). */
  highlight?: string;
  ```
- In `parseInvestigationState`, add to the returned object:
  ```ts
  highlight: get("highlight"),
  ```
- In `serializeInvestigationState`, before `return q;`:
  ```ts
  if (state.highlight) q.set("highlight", state.highlight);
  ```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/analytics/__tests__/investigation-highlight.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/investigation-state.ts \
        src/lib/analytics/__tests__/investigation-highlight.test.ts
git commit -m "feat: carry highlight target in investigation scope

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Nav-banner store (for narrated undo)

A tiny pub/sub so the palette can tell `AppShell` "I auto-navigated here, and
why," without prop-drilling across the router boundary.

**Files:**
- Create: `src/lib/analytics/nav-banner.ts`
- Test: `src/lib/analytics/__tests__/nav-banner.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface NavBanner { label: string; reason: string; fromHref: string; }
  export function emitNavBanner(b: NavBanner): void;
  export function subscribeNavBanner(fn: (b: NavBanner) => void): () => void;
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/analytics/__tests__/nav-banner.test.ts`:
```ts
import { emitNavBanner, subscribeNavBanner } from "../nav-banner";

it("delivers an emitted banner to subscribers and unsubscribes cleanly", () => {
  const seen: string[] = [];
  const off = subscribeNavBanner((b) => seen.push(b.label));
  emitNavBanner({ label: "Defect Analysis · April", reason: "rejection spike", fromHref: "/" });
  off();
  emitNavBanner({ label: "COPQ", reason: "x", fromHref: "/" });
  expect(seen).toEqual(["Defect Analysis · April"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/analytics/__tests__/nav-banner.test.ts`
Expected: FAIL — "Cannot find module '../nav-banner'".

- [ ] **Step 3: Write `nav-banner.ts`**

`src/lib/analytics/nav-banner.ts`:
```ts
// Minimal pub/sub for the "the AI drove here — why + undo" banner.
export interface NavBanner {
  label: string;    // e.g. "Defect Analysis · April"
  reason: string;   // e.g. "rejection spike"
  fromHref: string; // where the user was, for Undo
}

type Fn = (b: NavBanner) => void;
const subscribers = new Set<Fn>();

export function emitNavBanner(b: NavBanner): void {
  for (const fn of subscribers) fn(b);
}

export function subscribeNavBanner(fn: Fn): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/analytics/__tests__/nav-banner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/nav-banner.ts src/lib/analytics/__tests__/nav-banner.test.ts
git commit -m "feat: nav-banner pub/sub for narrated undo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Wire the CommandPalette to `resolveIntent`

On submit, resolve intent; confident → auto-navigate with highlight + emit the
banner; ambiguous → keep the existing ranked pick-list.

**Files:**
- Modify: `src/components/app/CommandPalette.tsx`

**Interfaces:**
- Consumes: `resolveIntent` (Task 4), `hrefForNav` (Task 3), `llmSlotExtractor`
  (Task 4), `goInvestigation`, `investigationHref` (`investigation-state.ts`),
  `emitNavBanner` (Task 6). Needs `events` + `persona` (already props) and the
  data-max date + current scope (derive below).

- [ ] **Step 1: Add an async submit path**

In `src/components/app/CommandPalette.tsx`, add imports:
```ts
import { resolveIntent, hrefForNav, CONFIDENT } from "@/lib/analytics/intent";
import { llmSlotExtractor } from "@/lib/analytics/intent-llm";
import { goInvestigation } from "@/lib/analytics/investigation-state";
import { emitNavBanner } from "@/lib/analytics/nav-banner";
```

Add a submit handler inside the component:
```ts
const submitIntent = useCallback(async () => {
  const q = query.trim();
  if (!q) return;
  const events = props_events(); // see Step 2
  const dates = (events ?? []).map((e) => e.occurredOn?.start).filter(Boolean).sort();
  const dataMaxIso = dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10);

  const result = await resolveIntent(
    q,
    { events: events ?? [], currentScope: { grain: "month" }, persona, dataMaxIso },
    llmSlotExtractor,
  );

  if (result.confidence >= CONFIDENT) {
    const fromHref = window.location.pathname + window.location.search;
    const stateWithHighlight = { ...result.state, highlight: result.highlights[0] };
    const label =
      [result.matched.defect, result.matched.stage, result.matched.size, result.matched.metric, result.matched.period]
        .filter(Boolean)
        .join(" · ") || "view";
    emitNavBanner({ label, reason: q, fromHref });
    onClose();
    goInvestigation((href) => router.push(href), hrefForNav(result.navKey), stateWithHighlight);
    return;
  }
  // ambiguous → leave the existing hit list visible (no-op)
}, [query, persona, onClose, router]);
```

- [ ] **Step 2: Pass events through**

`events` is already a prop (`events: Event[] | null`). Replace the placeholder
`props_events()` call above with the prop directly:
```ts
const events = events ?? [];
```
(Adjust the surrounding lines to use the `events` prop; delete the
`props_events()` helper reference — it was pseudocode.)

- [ ] **Step 3: Trigger submit on Enter when no hit is actively chosen**

In the existing keydown effect, change the `Enter` branch so a non-empty query
with no better hit routes through intent first:
```ts
} else if (e.key === "Enter") {
  e.preventDefault();
  if (hits[activeIdx] && hits[activeIdx].kind !== "destination") {
    go(hits[activeIdx]);          // user picked a specific entity/recent
  } else {
    void submitIntent();          // interpret the sentence
  }
}
```
Add `submitIntent` to that effect's dependency array.

- [ ] **Step 4: Manual smoke test**

Run the app (`npm run dev`), open ⌘K, type "rejection in April", press Enter.
Expected: navigates to `/defect-analysis?...&metric=defect&highlight=defect` with
April dates. Type "what should I look at" → stays on the pick-list.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/app/CommandPalette.tsx
git commit -m "feat: command palette resolves intent and auto-navigates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Narrated-undo banner in AppShell

Render the banner emitted by the palette; Undo returns to the prior href.

**Files:**
- Modify: `src/components/app/AppShell.tsx`

**Interfaces:**
- Consumes: `subscribeNavBanner`, `type NavBanner` (Task 6); `useRouter`.

- [ ] **Step 1: Subscribe + render**

In `src/components/app/AppShell.tsx`, add:
```ts
import { subscribeNavBanner, type NavBanner } from "@/lib/analytics/nav-banner";
```
Inside the component:
```ts
const [banner, setBanner] = useState<NavBanner | null>(null);
useEffect(() => subscribeNavBanner(setBanner), []);
useEffect(() => {
  if (!banner) return;
  const t = window.setTimeout(() => setBanner(null), 8000);
  return () => window.clearTimeout(t);
}, [banner]);
```
Render near the top of the main content area:
```tsx
{banner && (
  <div
    role="status"
    style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 14px", margin: "8px 0",
      background: "var(--accent-weak)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--text)",
    }}
  >
    <span>
      Opened <strong>{banner.label}</strong>{" "}
      <span style={{ color: "var(--text-3)" }}>· {banner.reason}</span>
    </span>
    <button
      type="button"
      onClick={() => { const to = banner.fromHref; setBanner(null); router.push(to); }}
      style={{
        marginLeft: "auto", border: "1px solid var(--border-strong)",
        borderRadius: 4, padding: "2px 10px", background: "transparent",
        color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: 12,
      }}
    >
      Undo
    </button>
  </div>
)}
```
(If `AppShell` doesn't already have `router`, add `const router = useRouter();`.)

- [ ] **Step 2: Manual smoke test**

⌘K → "copq this fy" → Enter. Banner appears: "Opened COPQ · copq this fy · [Undo]".
Click Undo → returns to the previous page. Banner auto-dismisses after 8s.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/app/AppShell.tsx
git commit -m "feat: narrated-undo banner for AI navigation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Screens read `highlight` and spotlight the KPI

Make target screens honor `?highlight=<metric>` by ringing the matching KPI.

**Files:**
- Modify: the analysis screens that render KPI cards — start with
  `src/app/defect-analysis/page.tsx`, `src/app/copq/page.tsx`,
  `src/app/stage-analysis/page.tsx`, `src/app/size-analysis/page.tsx`.
  (Follow whatever KPI card component each renders.)

**Interfaces:**
- Consumes: `parseInvestigationState` (`highlight` field, Task 5), `useSearchParams`.

- [ ] **Step 1: Read the highlight param**

In each screen (or the shared KPI-strip component they use), derive:
```ts
const params = useSearchParams();
const highlight = params.get("highlight"); // e.g. "defect"
```

- [ ] **Step 2: Ring the matching KPI**

Where a KPI card is rendered, when its metric/`sourceColumn`/id matches
`highlight`, add a spotlight ring (CSS variables, reuse the existing
`pulse-ring` animation named in AGENTS.md):
```tsx
<div
  className={kpiMatchesHighlight(kpi, highlight) ? "pulse-ring" : undefined}
  style={
    kpiMatchesHighlight(kpi, highlight)
      ? { outline: "2px solid var(--accent)", borderRadius: "var(--radius-sm)" }
      : undefined
  }
>
  {/* existing KPI card */}
</div>
```
Add a local helper in each screen (or a shared util if a KPI-strip component
exists):
```ts
function kpiMatchesHighlight(kpi: { source?: string | null; sourceColumn?: string | null; label: string }, highlight: string | null): boolean {
  if (!highlight) return false;
  const h = highlight.toLowerCase();
  return (
    (kpi.source ?? "").toLowerCase().includes(h) ||
    (kpi.sourceColumn ?? "").toLowerCase().includes(h) ||
    kpi.label.toLowerCase().includes(h)
  );
}
```

- [ ] **Step 3: Manual smoke test**

⌘K → "rejection in April" → Enter. On `/defect-analysis` the rejection/defect
KPI shows the accent ring; other KPIs don't. Navigating without `highlight`
shows no ring.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/defect-analysis/page.tsx src/app/copq/page.tsx \
        src/app/stage-analysis/page.tsx src/app/size-analysis/page.tsx
git commit -m "feat: spotlight the KPI named by the highlight scope

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Full regression + PR

- [ ] **Step 1: Run the whole suite**

Run: `npx jest`
Expected: all green (existing 130+ tests plus the new intent/date/vocab/banner/highlight tests).

- [ ] **Step 2: Typecheck the project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Offline check**

Temporarily unset `MINICPM_BASE_URL` and `GROQ_API_KEY` in `.env.local`, run the
app, ⌘K → "rejection in April" → Enter. Expected: still navigates (deterministic
path, no LLM). Restore env after.

- [ ] **Step 4: Open the PR**

```bash
git push -u origin feat/nav-first-assistant
gh pr create --title "Navigation-first assistant (v1)" \
  --body "Implements docs/superpowers/specs/2026-07-22-navigation-first-assistant-design.md. Deterministic intent → scoped auto-navigation with narrated undo; MiniCPM fallback reconciled against real entities; offline-safe.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review

**Spec coverage:**
- §3 architecture → Tasks 3–4 (resolver + fallback). ✓
- §4.1 resolveIntent → Task 3/4. ✓
- §4.2 date-phrase + entity/metric matcher → Tasks 1, 2. ✓
- §4.3 metric→screen routing (`answersMetric`) → Task 2 (`METRIC_SCREEN`/`screenForMetric`; note: implemented as a map rather than a per-row field — same outcome, one source of truth). ✓
- §4.4 highlight in InvestigationState → Task 5 + Task 9. ✓
- §4.5 Ask bar + undo banner → Tasks 7, 8 (+ 6 for the store). ✓
- §4.6 LLM footprint (one fast call, reconciled) → Task 4. ✓
- §5 scope boundaries → no task computes a metric or mutates data. ✓
- §6 testing → Tasks 1–6 each ship tests; Task 10 regression + offline check. ✓
- §7 files → all listed files appear in a task. ✓
- §8 success criteria → Task 10 Steps 1–3 verify them. ✓

**Placeholder scan:** the `props_events()` token in Task 7 Step 1 is pseudocode, explicitly replaced in Step 2 with the real `events` prop. No other TBD/TODO/"handle edge cases". ✓

**Type consistency:** `IntentResult`, `IntentCtx`, `SlotExtractor`, `CONFIDENT`, `hrefForNav`, `NavBanner` names are used identically across Tasks 3–8. `InvestigationState.highlight` (Task 5) is consumed in Tasks 7 and 9. `screenForMetric`/`METRIC_SCREEN` (Task 2) consumed in Task 3. ✓

**Note for the implementer:** the exact field names on `Event` (`occurredOn.start`, `defectCode`, `stageId`, `size`, `customFields.batch`) are copied from `src/lib/analytics/search-index.ts` and `scope.ts`. Verify against `src/lib/contract/d1.ts` (`CanonicalEvent`) if a match ever returns empty — the accessor helpers in Task 2 are the single place to fix.

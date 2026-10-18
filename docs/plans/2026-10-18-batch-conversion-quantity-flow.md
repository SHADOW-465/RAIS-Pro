# Batch conversion quantity flow — implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert Batch opens a slide-faithful quantity flow board on `/batch-conversion`, and Audit Trail splits original | convert on one original-lot row.

**Architecture:** Pure lineage helpers build the board model and the audit pairing. UI reads ledger rows + lineage; POST `/api/batch-conversions` is unchanged. Analytics / ingest / batch-id stay isolated.

**Tech Stack:** Next.js 16, React 19, Jest (node), CSS variables, Geist.

Design: `docs/plans/2026-10-18-batch-conversion-quantity-flow-design.md`

---

### Task 1: Quantity flow model

**Files:**
- Create: `src/lib/lineage/quantity-flow.ts`
- Test: `src/lib/lineage/__tests__/quantity-flow.test.ts`
- Modify: `src/lib/lineage/index.ts`

**Step 1:** Failing tests for `chipFromQty` identity, convert half starting at `stageId`, downstream convert checked following convert accept, no demo numbers on empty lots.

**Step 2:** Implement `chipFromQty`, `stageShowsConvert`, `buildQuantityFlow`.

**Step 3:** `npx jest src/lib/lineage/__tests__/quantity-flow.test.ts`

**Step 4:** Commit.

---

### Task 2: Audit halves

**Files:**
- Create: `src/lib/lineage/audit-halves.ts`
- Test: `src/lib/lineage/__tests__/audit-halves.test.ts`
- Modify: `src/lib/lineage/index.ts`

**Step 1:** Failing tests — original group gets convert half; `toBatch` omitted; unconverted lots unchanged.

**Step 2:** Implement `attachConversionHalves`.

**Step 3:** Run tests + isolation tests.

**Step 4:** Commit.

---

### Task 3: QuantityFlowBoard UI

**Files:**
- Create: `src/components/entry/QuantityFlowBoard.tsx`
- Modify: `src/app/batch-conversion/page.tsx`

Board matches the training slide: PRODUCTION / SECONDARY / VISUAL / BALLOON bands, `CHECKED = ACCEPT + HOLD + REJ + WIP`, remain-qty arrow into convert boxes, new size + qty against the original lot. Wire above the existing record-conversion fields (compact bar, original batch read-only).

---

### Task 4: Audit Trail split

**Files:**
- Modify: `src/app/audit/page.tsx`

`attachConversionHalves` on batch groups. Split `BatchProcessTrack`. Open row: original | convert entry cards. Convert quantity button → `/batch-conversion?fromBatch=`.

---

### Task 5: Verify

- `npx jest src/lib/lineage`
- `npx tsc --noEmit`
- Browser: Data Entry Convert Batch → flow board; Audit split + Convert quantity
- `graphify update .`

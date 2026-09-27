"use client";

// Data Entry → History.
//
// Same ledger, same collapse functions as the Audit trail (buildEntryRows →
// groupByBatchThenStage) so the two surfaces can never disagree about what a
// batch contains. The difference is job, not data:
//
//   History      — "what did I enter, and which lots are still open?"
//                  Direct entry first, newest first, read + reuse. No erase.
//   Audit trail  — "what is in the ledger, from any source, forever?"
//                  Provenance, corrections, and the erase path (GM only).
//
// Erase deliberately lives on one screen. An operator saving a batch here must
// not be able to un-save it; that is the Audit trail's job and the GM's call.

import React, { useEffect, useMemo, useState } from "react";
import type { Grain } from "@/lib/analytics/scope";
import {
  buildEntryRows,
  filterEntryRows,
  groupByBatchThenStage,
  groupByPeriod,
  isDirectEntry,
  batchFiguresInconsistent,
  listRowSizes,
  batchOf,
  type AuditBatchGroup,
  type AuditEntryRow,
  type AuditEventLike,
} from "@/lib/analytics/audit-sessions";
import { buildBatchProgress, progressFor } from "@/lib/analytics/batch-progress";
import { buildLineStatus, type LineStatus } from "@/lib/entry/line-status";
import { resolveEntrySchema } from "@/lib/entry/entry-schema";
import { canonicalBatchId } from "@/lib/entry/batch-id";
import LotProgress from "@/components/LotProgress";
import EntryRevisionHistory from "@/components/entry/EntryRevisionHistory";
import BatchIdChip from "@/components/entry/BatchIdChip";
import Icon from "@/components/editorial/Icon";
import { usePersona } from "@/components/app/PersonaContext";
import Select from "@/components/ui/Select";
import {
  CATHETER_CATEGORIES,
  CATHETER_TYPES,
  categoryAndTypeFrom,
  describeProductType,
  sizesFor,
  SHIFT_STORAGE_KEY,
  type ShiftBatchRecord,
  type CatheterCategory,
  type CatheterType,
} from "@/lib/entry/disposafe-matrix";
import { sortStageIds, stageCategoryOf, STAGE_CATEGORIES } from "@/core/ontology/plant-catalog";

function laneForStage(stageId: string): string {
  const cat = stageCategoryOf(stageId);
  if (cat) return cat;
  const s = stageId.toLowerCase();
  if (s.includes("dipp") || s.includes("prod") || s.includes("leach") || s.includes("chlor") || s.includes("gauge") || s.includes("trim")) return "primary";
  if (s.includes("visual") || s.includes("balloon") || s.includes("valve") || s.includes("final") || s.includes("pack") || s.includes("assembly")) return "assembly";
  return "secondary";
}

const PROCESS_LABEL: Record<string, string> = Object.fromEntries(
  STAGE_CATEGORIES.map((c) => [c.id, c.label]),
);

type SourceScope = "mine" | "all";
type StatusScope = "all" | "open" | "complete";
type LedgerScope = "all" | "synced" | "pending";
type SortOption = "newest" | "oldest" | "batch-asc" | "batch-desc" | "volume-desc" | "rejection-desc";



const STAGE_LABEL: Record<string, string> = {
  visual: "Visual",
  balloon: "Balloon",
  "valve-integrity": "Valve Integrity",
  final: "Final",
  production: "Primary production",
  secondary: "Secondary production",
};

const stageLabel = (id: string) => STAGE_LABEL[id] ?? id;

/** One column template for the list header and every row, so figures align. */
/** "15–31 Jul" / "15 Jul – 2 Aug" / "15 Jul". */
function compactRange(from: string, to: string): string {
  const fmt = (iso: string, withMonth: boolean) => {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    const day = d.getUTCDate();
    return withMonth
      ? `${day} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`
      : String(day);
  };
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from)) return from;
  if (from === to) return fmt(from, true);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${fmt(from, !sameMonth)}–${fmt(to, true)}`;
}

const HISTORY_COLS = "16px minmax(140px, 1.15fr) minmax(84px, 0.8fr) minmax(280px, 3fr) 76px 76px 76px";

function BatchProcessTrack({
  lineStatus,
  progress,
}: {
  lineStatus?: LineStatus | null;
  progress?: ReturnType<typeof progressFor>;
}) {
  if (!lineStatus || lineStatus.lanes.length === 0) {
    return progress && progress.doneCount > 0 ? (
      <LotProgress progress={progress} showLabels={false} />
    ) : (
      <span style={{ color: "var(--text-3)", fontSize: "var(--text-xs)" }}>—</span>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
      {lineStatus.lanes.map((lane) => {
        const isPrimary = lane.id === "primary";
        const isSecondary = lane.id === "secondary";
        const isAssembly = lane.id === "assembly";
        const shortName = isPrimary ? "Primary Dipping" : isSecondary ? "Secondary" : isAssembly ? "Assembly" : lane.label;
        const isDone = lane.complete;
        const isStarted = lane.started && !lane.complete;

        const countText = isDone
          ? isPrimary
            ? "completed"
            : `${lane.done}/${lane.total} completed`
          : isStarted
            ? `${lane.done}/${lane.total}`
            : "—";

        const tagColor = isDone
          ? "var(--positive)"
          : isStarted
            ? "var(--status-warn, #d97706)"
            : "var(--text-3)";
        const tagBg = isDone
          ? "var(--positive-weak)"
          : isStarted
            ? "var(--warning-weak)"
            : "var(--surface-2)";

        return (
          <span
            key={lane.id}
            title={`${lane.label}: ${isDone ? "Completed" : isStarted ? `${lane.done}/${lane.total} complete` : "Not started"}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3.5,
              fontSize: "11px",
              padding: "1.5px 6px",
              borderRadius: "4px",
              background: tagBg,
              color: tagColor,
              border: `1px solid color-mix(in srgb, ${tagColor} 26%, transparent)`,
              whiteSpace: "nowrap",
              lineHeight: 1.25,
              fontFamily: "var(--font-sans)",
            }}
          >
            <span style={{ fontSize: 8 }}>{isDone ? "✓" : isStarted ? "●" : "○"}</span>
            <span style={{ fontWeight: 600 }}>{shortName}</span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: isDone || isStarted ? 700 : 400,
                opacity: 0.95,
              }}
            >
              {countText}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Right-aligned tabular figure; a zero reads as a dash, not a loud 0. */
function Cell({ value, tone }: { value: number; tone?: string }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-sm)",
        fontWeight: value > 0 ? 600 : 400,
        color: value > 0 ? (tone ?? "var(--text)") : "var(--text-3)",
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value > 0 ? value.toLocaleString() : "\u2014"}
    </span>
  );
}

function fmtDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtStamp(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EntryHistory({
  events,
  onEdit,
  onReuse,
  initialStatus = "all",
  initialSearch = "",
  initialBatch,
  grain = "month",
  batchLabel,
}: {
  events: AuditEventLike[];
  /** Open this station's recorded row on the entry form for correction. */
  onEdit?: (row: AuditEntryRow) => void;
  /** Copy only the lot code onto the form (next station, new quantities). */
  onReuse?: (row: AuditEntryRow) => void;
  /** Status to land on, e.g. arriving from the dashboard's WIP strip. */
  initialStatus?: StatusScope;
  /** Pre-fill the search box (e.g. from a ?batch= URL param). */
  initialSearch?: string;
  /** Batch ID to automatically expand once events load (from DE deep-link). */
  initialBatch?: string;
  /** Topbar Day / Week / Month / FY — groups the list under period headers. */
  grain?: Grain;
  /** Optional display name, e.g. `26I17-16 CT 26I17-18` for a converted lot. */
  batchLabel?: (batch: string) => string;
}) {
  const { canEraseLedger } = usePersona();
  const [search, setSearch] = useState(initialSearch);
  const [scope, setScope] = useState<SourceScope>("mine");
  const [status, setStatus] = useState<StatusScope>(initialStatus);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerScope>("all");
  const [groupByLedger, setGroupByLedger] = useState(false);
  const [stageFilter, setStageFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [productTypeFilter, setProductTypeFilter] = useState("all");
  const [size, setSize] = useState("all");
  const [sortOrder, setSortOrder] = useState<SortOption>("newest");
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [historyRow, setHistoryRow] = useState<AuditEntryRow | null>(null);
  const [localShiftRows, setLocalShiftRows] = useState<AuditEntryRow[]>([]);
  // Track whether we've already auto-expanded the initialBatch
  const autoExpandedRef = React.useRef(false);


  // Load unsynced shift batches from localStorage to show realtime "not on ledger" batches
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(SHIFT_STORAGE_KEY);
      if (!raw) {
        setLocalShiftRows([]);
        return;
      }
      const parsed: ShiftBatchRecord[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const uncommitted = parsed.filter((r) => !r.synced);
      if (uncommitted.length === 0) {
        setLocalShiftRows([]);
        return;
      }

      // Convert unsynced shift records to AuditEntryRow
      const converted: AuditEntryRow[] = uncommitted.map((r) => {
        const defectsList = Object.entries(r.defects || {})
          .filter(([, qty]) => qty > 0)
          .map(([code, qty]) => ({ code, qty }));

        return {
          id: `local:${r.id}`,
          date: r.date,
          batch: r.batchId,
          stageId: r.stageId || r.micro || "production",
          size: r.size || null,
          checked: r.checked || 0,
          accepted: r.accept || 0,
          rejected: r.reject || 0,
          rework: r.hold || 0,
          defects: defectsList,
          source: "manual",
          fileLabel: "Local shift log (not on ledger)",
          recordedAt: r.savedAt,
          eventIds: [], // Empty eventIds identifies local uncommitted entries
          commentCount: 0,
          hasCorrection: false,
          revisionCount: 1,
          shifts: r.shift ? [r.shift] : [],
          productType: r.productType || null,
        };
      });

      setLocalShiftRows(converted);
    } catch {
      setLocalShiftRows([]);
    }
  }, [events]);

  const progressMap = useMemo(() => buildBatchProgress(events), [events]);

  const lineStatusMap = useMemo(() => {
    const schema = resolveEntrySchema(null);
    const map = new Map<string, LineStatus>();
    const batchOccupied = new Map<string, Set<string>>();

    for (const e of events) {
      const raw = batchOf(e);
      if (!raw) continue;
      const b = canonicalBatchId(raw) ?? raw.trim().toUpperCase();
      if (!b) continue;
      let set = batchOccupied.get(b);
      if (!set) {
        set = new Set();
        batchOccupied.set(b, set);
      }
      if (
        e.stageId &&
        ((e.quantity ?? 0) > 0 ||
          e.eventType === "production" ||
          e.eventType === "inspection" ||
          e.eventType === "rejection")
      ) {
        set.add(e.stageId);
      }
    }

    // Also factor in local unsynced stages
    for (const r of localShiftRows) {
      const b = canonicalBatchId(r.batch) ?? r.batch.trim().toUpperCase();
      if (!b) continue;
      let set = batchOccupied.get(b);
      if (!set) {
        set = new Set();
        batchOccupied.set(b, set);
      }
      if (r.stageId) {
        set.add(r.stageId);
      }
    }

    for (const [batch, occ] of batchOccupied) {
      map.set(batch, buildLineStatus({ lot: batch, schema, occupied: occ }));
    }
    return map;
  }, [events, localShiftRows]);

  /** Sizes are scoped to the current source so the list never offers a dead option. */
  const scopedRows = useMemo(() => {
    const scoped = scope === "mine" ? events.filter(isDirectEntry) : events;
    const ledgerRows = buildEntryRows(scoped);

    if (localShiftRows.length === 0) return ledgerRows;

    // Merge local rows if not already represented in ledger
    const existingKeys = new Set(ledgerRows.map((r) => `${r.batch}::${r.stageId}::${r.date}`));
    const nonDuplicatedLocal = localShiftRows.filter(
      (lr) => !existingKeys.has(`${lr.batch}::${lr.stageId}::${lr.date}`)
    );

    return [...nonDuplicatedLocal, ...ledgerRows];
  }, [events, scope, localShiftRows]);

  const sizeOptions = useMemo(() => listRowSizes(scopedRows), [scopedRows]);

  const stageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of scopedRows) if (r.stageId) set.add(r.stageId);
    // Sorted in plant-schema order (Primary → Secondary → Assembly), then
    // grouped under that same process so the menu reads as the three-process
    // shop floor instead of one flat alphabetical list — same as Audit trail.
    return sortStageIds([...set]).map((s) => ({
      value: s,
      label: stageLabel(s),
      group: PROCESS_LABEL[laneForStage(s)] ?? "Other",
    }));
  }, [scopedRows]);

  /** Valid sizes allowed by the current Category and Type filter. */
  const validSizesForSelection = useMemo(() => {
    if (categoryFilter === "Female") return sizesFor("Female", "2 way");
    if (categoryFilter === "Peadiatric") return sizesFor("Peadiatric", "2 way");
    if (categoryFilter === "Male") {
      return sizesFor("Male", productTypeFilter === "3 way" ? "3 way" : "2 way");
    }
    if (productTypeFilter === "3 way") return sizesFor("Male", "3 way");
    return null;
  }, [categoryFilter, productTypeFilter]);

  /** Filter the dropdown sizes to only valid ranges for the chosen Category/Type. */
  const availableSizeOptions = useMemo(() => {
    if (!validSizesForSelection) return sizeOptions;
    return sizeOptions.filter((sz) => {
      const canon = sz.endsWith("Fr") ? sz : `${sz}Fr`;
      const noFr = sz.replace(/^Fr/i, "");
      return (
        validSizesForSelection.includes(canon as any) ||
        validSizesForSelection.some((v) => v.replace(/^Fr/i, "") === noFr)
      );
    });
  }, [sizeOptions, validSizesForSelection]);

  // Reset size to "all" if the currently picked size is invalid for the new category
  useEffect(() => {
    if (size !== "all" && availableSizeOptions.length > 0 && !availableSizeOptions.includes(size)) {
      setSize("all");
    }
  }, [availableSizeOptions, size]);

  // If Female or Peadiatric is selected, reset type if it was 3-way
  useEffect(() => {
    if ((categoryFilter === "Female" || categoryFilter === "Peadiatric") && productTypeFilter === "3 way") {
      setProductTypeFilter("all");
    }
  }, [categoryFilter, productTypeFilter]);

  const typeOptions = useMemo(() => {
    if (categoryFilter === "Female" || categoryFilter === "Peadiatric") {
      return [{ value: "all", label: "Type: 2 way" }];
    }
    return [
      { value: "all", label: "Type: All" },
      ...CATHETER_TYPES.map((t) => ({ value: t, label: `Type: ${t}` })),
    ];
  }, [categoryFilter]);

  // Helper to check if a batch group is on ledger
  const isGroupOnLedger = (g: AuditBatchGroup) => {
    // If all rows in all stages have eventIds > 0, it's on ledger.
    // If any row has eventIds.length === 0 or comes from local shift log, it's pending/not on ledger.
    const allRows = g.stages.flatMap((s) => s.rows);
    return allRows.length > 0 && allRows.every((r) => r.eventIds && r.eventIds.length > 0);
  };

  const baseGroups = useMemo(() => {
    let rows = filterEntryRows(scopedRows, { search, size, stageId: stageFilter, batchLabel });
    if (categoryFilter !== "all" || productTypeFilter !== "all") {
      rows = rows.filter((r) => {
        const { category, type } = categoryAndTypeFrom(r.productType);
        if (categoryFilter !== "all" && category !== categoryFilter) return false;
        if (productTypeFilter !== "all" && type !== productTypeFilter) return false;
        return true;
      });
    }
    let all = groupByBatchThenStage(rows);
    if (status !== "all") {
      all = all.filter((g) => {
        const ls = lineStatusMap.get(g.batch);
        const complete = ls ? ls.isComplete : progressFor(progressMap, g.batch)?.status === "complete";
        return status === "complete" ? complete : !complete;
      });
    }
    return [...all].sort((a, b) => {
      const aLabel = batchLabel ? batchLabel(a.batch) : a.batch;
      const bLabel = batchLabel ? batchLabel(b.batch) : b.batch;
      if (sortOrder === "newest") return b.dateTo.localeCompare(a.dateTo) || aLabel.localeCompare(bLabel);
      if (sortOrder === "oldest") return a.dateFrom.localeCompare(b.dateFrom) || aLabel.localeCompare(bLabel);
      if (sortOrder === "batch-asc") return aLabel.localeCompare(bLabel);
      if (sortOrder === "batch-desc") return bLabel.localeCompare(aLabel);
      if (sortOrder === "volume-desc") return b.checkedQty - a.checkedQty || aLabel.localeCompare(bLabel);
      if (sortOrder === "rejection-desc") return b.rejectedQty - a.rejectedQty || aLabel.localeCompare(bLabel);
      return 0;
    });
  }, [scopedRows, search, size, stageFilter, categoryFilter, productTypeFilter, status, sortOrder, progressMap, lineStatusMap, batchLabel]);

  // Auto-expand initialBatch once events have loaded and the group appears
  useEffect(() => {
    if (!initialBatch || autoExpandedRef.current || baseGroups.length === 0) return;
    const target = initialBatch.trim().toUpperCase();
    const match = baseGroups.find(
      (g) => g.batch.trim().toUpperCase() === target || g.batch.toUpperCase().includes(target),
    );
    if (match) {
      autoExpandedRef.current = true;
      setOpenBatch(match.batch);
      // If not visible under current scope, widen to "all"
      const inScope = baseGroups.some((g) => g.batch === match.batch);
      if (!inScope) setScope("all");
    }
  }, [initialBatch, baseGroups]);

  // Counts for ledger pills

  const totalBatchCount = baseGroups.length;
  const onLedgerCount = useMemo(() => baseGroups.filter(isGroupOnLedger).length, [baseGroups]);
  const notOnLedgerCount = useMemo(() => baseGroups.filter((g) => !isGroupOnLedger(g)).length, [baseGroups]);

  // Filtered groups according to ledger filter
  const groups = useMemo(() => {
    if (ledgerFilter === "synced") {
      return baseGroups.filter(isGroupOnLedger);
    }
    if (ledgerFilter === "pending") {
      return baseGroups.filter((g) => !isGroupOnLedger(g));
    }
    return baseGroups;
  }, [baseGroups, ledgerFilter]);

  const periods = useMemo(() => groupByPeriod(groups, grain), [groups, grain]);

  // Partitioned periods when Group by Status is active
  const groupedSections = useMemo(() => {
    if (!groupByLedger || ledgerFilter !== "all") return null;

    const onLedgerGroups = baseGroups.filter(isGroupOnLedger);
    const notOnLedgerGroups = baseGroups.filter((g) => !isGroupOnLedger(g));

    return {
      onLedger: {
        count: onLedgerGroups.length,
        periods: groupByPeriod(onLedgerGroups, grain),
      },
      notOnLedger: {
        count: notOnLedgerGroups.length,
        periods: groupByPeriod(notOnLedgerGroups, grain),
      },
    };
  }, [groupByLedger, ledgerFilter, baseGroups, grain]);

  const summary = useMemo(() => {
    let open = 0;
    let stalled = 0;
    let rows = 0;
    for (const g of groups) {
      rows += g.rowCount;
      const ls = lineStatusMap.get(g.batch);
      const isComplete = ls ? ls.isComplete : progressFor(progressMap, g.batch)?.status === "complete";
      if (!isComplete) open += 1;
      const p = progressFor(progressMap, g.batch);
      if (p?.stalled) stalled += 1;
    }
    return { batches: groups.length, rows, open, stalled };
  }, [groups, progressMap, lineStatusMap]);

  const searching = search.trim().length > 0;

  return (
    <section
      aria-label="Entry history"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          padding: "var(--pad-card) var(--pad-card) 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* No section title: the active tab already reads "History", and two
            identical headings a few pixels apart is noise, not hierarchy. */}
        <div style={{ minWidth: 0 }}>
          <p
            className="muted"
            style={{ fontSize: "var(--text-sm)", margin: 0, maxWidth: "62ch", lineHeight: "var(--leading-body)" }}
          >
            Every batch you have saved, newest first. Open one to read the stages back exactly as
            they were entered.{" "}
            {canEraseLedger ? (
              <>
                Erasing a saved row lives in the{" "}
                <a href="/audit" style={{ color: "var(--accent)", fontWeight: 600 }}>
                  Audit trail
                </a>
                , where the full provenance is visible.
              </>
            ) : (
              <>Saved rows are permanent here — ask a GM if something needs erasing.</>
            )}
          </p>
        </div>

        <div style={{ width: "min(280px, 100%)", flexShrink: 0 }}>
          <input
            type="search"
            placeholder="Search batch, stage, size, defect…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search history"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-strong)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: "var(--text-md)",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
      </header>

        {/* Dropdown filters + counts share one band */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px 10px",
          padding: "10px var(--pad-card)",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2, var(--bg))",
        }}
      >
        {/* All Batches Button */}
        <button
          type="button"
          onClick={() => setLedgerFilter("all")}
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "var(--radius-pill)",
            background: ledgerFilter === "all" ? "var(--surface-3)" : "var(--surface)",
            color: ledgerFilter === "all" ? "var(--text)" : "var(--text-3)",
            border: `1px solid ${ledgerFilter === "all" ? "var(--border-strong)" : "var(--border)"}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all var(--duration-fast) var(--ease-out)",
          }}
          title="Show all batches"
        >
          All ({totalBatchCount})
        </button>

        {/* On Ledger Filter Pill */}
        <button
          type="button"
          onClick={() => setLedgerFilter(ledgerFilter === "synced" ? "all" : "synced")}
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "var(--radius-pill)",
            background: ledgerFilter === "synced" ? "var(--positive)" : "var(--positive-weak)",
            color: ledgerFilter === "synced" ? "#ffffff" : "var(--positive)",
            border: ledgerFilter === "synced"
              ? "1px solid var(--positive)"
              : "1px solid color-mix(in srgb, var(--positive) 30%, transparent)",
            boxShadow: ledgerFilter === "synced"
              ? "0 0 0 2px color-mix(in srgb, var(--positive) 25%, transparent)"
              : "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            transition: "all var(--duration-fast) var(--ease-out)",
          }}
          title="Filter batches confirmed on ledger"
        >
          <span style={{ fontSize: 9 }}>●</span>
          <span>{onLedgerCount} on ledger</span>
        </button>

        {/* Not on Ledger Filter Pill */}
        <button
          type="button"
          onClick={() => setLedgerFilter(ledgerFilter === "pending" ? "all" : "pending")}
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "var(--radius-pill)",
            background: ledgerFilter === "pending" ? "var(--status-warn, #d97706)" : "var(--warning-weak)",
            color: ledgerFilter === "pending" ? "#ffffff" : "var(--status-warn, #d97706)",
            border: ledgerFilter === "pending"
              ? "1px solid var(--status-warn, #d97706)"
              : "1px solid color-mix(in srgb, var(--status-warn, #d97706) 30%, transparent)",
            boxShadow: ledgerFilter === "pending"
              ? "0 0 0 2px color-mix(in srgb, var(--status-warn, #d97706) 25%, transparent)"
              : "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 5,
            transition: "all var(--duration-fast) var(--ease-out)",
          }}
          title="Filter batches not yet on ledger (pending sync)"
        >
          <span style={{ fontSize: 9 }}>●</span>
          <span>{notOnLedgerCount} not on ledger</span>
        </button>

        {/* Group by Status Toggle */}
        {totalBatchCount > 0 && ledgerFilter === "all" && (
          <button
            type="button"
            onClick={() => setGroupByLedger(!groupByLedger)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 9px",
              borderRadius: "var(--radius-pill)",
              background: groupByLedger ? "var(--surface-3)" : "transparent",
              color: groupByLedger ? "var(--text)" : "var(--text-3)",
              border: `1px solid ${groupByLedger ? "var(--border-strong)" : "var(--border)"}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            title="Group into On Ledger and Not on Ledger sections"
          >
            <span style={{ fontSize: 10 }}>☷</span>
            <span>{groupByLedger ? "Grouped" : "Group by Status"}</span>
          </button>
        )}

        <Select
          value={scope}
          onChange={(v) => setScope(v as SourceScope)}
          options={[
            { value: "mine", label: "Source: Typed here" },
            { value: "all", label: "Source: All sources" },
          ]}
          variant="pill"
          size="sm"
          block={false}
          ariaLabel="Source filter"
        />
        <Select
          value={status}
          onChange={(v) => setStatus(v as StatusScope)}
          options={[
            { value: "all", label: "Status: All" },
            { value: "open", label: "Status: In progress" },
            { value: "complete", label: "Status: Complete" },
          ]}
          variant="pill"
          size="sm"
          block={false}
          ariaLabel="Status filter"
        />
        <Select
          value={stageFilter}
          onChange={setStageFilter}
          options={[{ value: "all", label: "Stage: All" }, ...stageOptions]}
          variant="pill"
          size="sm"
          block={false}
          ariaLabel="Stage filter"
        />
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[
            { value: "all", label: "Category: All" },
            ...CATHETER_CATEGORIES.map((c) => ({ value: c, label: `Category: ${c}` })),
          ]}
          variant="pill"
          size="sm"
          block={false}
          ariaLabel="Category filter"
        />
        <Select
          value={productTypeFilter}
          onChange={setProductTypeFilter}
          options={typeOptions}
          variant="pill"
          size="sm"
          block={false}
          ariaLabel="Product type filter"
        />
        {availableSizeOptions.length > 0 && (
          <Select
            value={size}
            onChange={setSize}
            options={[
              { value: "all", label: "Size: All sizes" },
              ...availableSizeOptions.map((sz) => ({ value: sz, label: `Size: ${sz}` })),
            ]}
            mono
            variant="pill"
            size="sm"
            block={false}
            ariaLabel="Size filter"
          />
        )}
        <Select
          value={sortOrder}
          onChange={(v) => setSortOrder(v as SortOption)}
          options={[
            { value: "newest", label: "Sort: Newest first" },
            { value: "oldest", label: "Sort: Oldest first" },
            { value: "batch-asc", label: "Sort: Batch (A–Z)" },
            { value: "batch-desc", label: "Sort: Batch (Z–A)" },
            { value: "volume-desc", label: "Sort: Checked (High–Low)" },
            { value: "rejection-desc", label: "Sort: Rejections (High–Low)" },
          ]}
          variant="pill"
          size="sm"
          block={false}
          ariaLabel="Sort order"
        />
        <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)", marginLeft: "auto" }}>
          <Num>{summary.batches}</Num> batch{summary.batches === 1 ? "" : "es"} ·{" "}
          <Num>{summary.rows}</Num> row{summary.rows === 1 ? "" : "s"}
          {summary.open > 0 && (
            <>
              {" · "}
              <Num tone="var(--accent)">{summary.open}</Num> in progress
            </>
          )}
          {summary.stalled > 0 && (
            <>
              {" · "}
              <Num tone="var(--critical)">{summary.stalled}</Num> stalled
            </>
          )}
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState searching={searching} query={search.trim()} scope={scope} />
      ) : (
        <div>
          <div
            aria-hidden="true"
            style={{
              display: "grid",
              gridTemplateColumns: HISTORY_COLS,
              gap: 12,
              padding: "6px var(--pad-card)",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
              fontSize: "var(--text-2xs)",
              fontWeight: 600,
              letterSpacing: "var(--tracking-label)",
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            <span />
            <span>Batch</span>
            <span>Dates</span>
            <span>Process Track</span>
            <span style={{ textAlign: "right" }}>Checked</span>
            <span style={{ textAlign: "right" }}>Accepted</span>
            <span style={{ textAlign: "right" }}>Rejected</span>
          </div>

          {groupedSections ? (
            <>
              {/* On Ledger Partition */}
              {groupedSections.onLedger.count > 0 && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px var(--pad-card)",
                      background: "color-mix(in srgb, var(--positive) 8%, var(--surface))",
                      borderBottom: "1px solid color-mix(in srgb, var(--positive) 25%, var(--border))",
                      borderTop: "1px solid color-mix(in srgb, var(--positive) 25%, var(--border))",
                    }}
                  >
                    <span style={{ color: "var(--positive)", fontSize: 10 }}>●</span>
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--positive)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      On Ledger — Confirmed ({groupedSections.onLedger.count})
                    </span>
                  </div>
                  {groupedSections.onLedger.periods.map((p) => (
                    <div key={`on-ledger-${p.period}`}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 10,
                          padding: "10px var(--pad-card) 6px",
                          borderBottom: "1px solid var(--border)",
                          background: "var(--surface)",
                          position: "sticky",
                          top: 0,
                          zIndex: 1,
                        }}
                      >
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>{p.label}</span>
                        <span className="small" style={{ color: "var(--text-3)" }}>
                          {p.batchCount} {p.batchCount === 1 ? "lot" : "lots"} · {p.rowCount}{" "}
                          {p.rowCount === 1 ? "entry" : "entries"}
                        </span>
                      </div>
                      {p.groups.map((g) => (
                        <HistoryBatch
                          key={g.batch}
                          group={g}
                          open={openBatch === g.batch}
                          onToggle={() => setOpenBatch((b) => (b === g.batch ? null : g.batch))}
                          progress={progressFor(progressMap, g.batch)}
                          lineStatus={lineStatusMap.get(g.batch) ?? null}
                          onEdit={onEdit}
                          onReuse={onReuse}
                          onHistory={setHistoryRow}
                          canErase={canEraseLedger}
                          batchLabel={batchLabel}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Not on Ledger Partition */}
              {groupedSections.notOnLedger.count > 0 && (
                <div style={{ marginTop: groupedSections.onLedger.count > 0 ? 8 : 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px var(--pad-card)",
                      background: "color-mix(in srgb, var(--status-warn, #d97706) 8%, var(--surface))",
                      borderBottom: "1px solid color-mix(in srgb, var(--status-warn, #d97706) 25%, var(--border))",
                      borderTop: "1px solid color-mix(in srgb, var(--status-warn, #d97706) 25%, var(--border))",
                    }}
                  >
                    <span style={{ color: "var(--status-warn, #d97706)", fontSize: 10 }}>●</span>
                    <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--status-warn, #d97706)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Not on Ledger — Pending Sync ({groupedSections.notOnLedger.count})
                    </span>
                  </div>
                  {groupedSections.notOnLedger.periods.map((p) => (
                    <div key={`not-on-ledger-${p.period}`}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 10,
                          padding: "10px var(--pad-card) 6px",
                          borderBottom: "1px solid var(--border)",
                          background: "var(--surface)",
                          position: "sticky",
                          top: 0,
                          zIndex: 1,
                        }}
                      >
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>{p.label}</span>
                        <span className="small" style={{ color: "var(--text-3)" }}>
                          {p.batchCount} {p.batchCount === 1 ? "lot" : "lots"} · {p.rowCount}{" "}
                          {p.rowCount === 1 ? "entry" : "entries"}
                        </span>
                      </div>
                      {p.groups.map((g) => (
                        <HistoryBatch
                          key={g.batch}
                          group={g}
                          open={openBatch === g.batch}
                          onToggle={() => setOpenBatch((b) => (b === g.batch ? null : g.batch))}
                          progress={progressFor(progressMap, g.batch)}
                          lineStatus={lineStatusMap.get(g.batch) ?? null}
                          onEdit={onEdit}
                          onReuse={onReuse}
                          onHistory={setHistoryRow}
                          canErase={canEraseLedger}
                          batchLabel={batchLabel}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            periods.map((p) => (
              <div key={p.period}>
                {/* One header per period. The list is lot-first, so this only
                    files the lots — it never splits a lot's stages apart. */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    padding: "10px var(--pad-card) 6px",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--surface)",
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>{p.label}</span>
                  <span className="small" style={{ color: "var(--text-3)" }}>
                    {p.batchCount} {p.batchCount === 1 ? "lot" : "lots"} · {p.rowCount}{" "}
                    {p.rowCount === 1 ? "entry" : "entries"}
                  </span>
                </div>
                {p.groups.map((g) => (
                  <HistoryBatch
                    key={g.batch}
                    group={g}
                    open={openBatch === g.batch}
                    onToggle={() => setOpenBatch((b) => (b === g.batch ? null : g.batch))}
                    progress={progressFor(progressMap, g.batch)}
                    lineStatus={lineStatusMap.get(g.batch) ?? null}
                    onEdit={onEdit}
                    onReuse={onReuse}
                    onHistory={setHistoryRow}
                    canErase={canEraseLedger}
                    batchLabel={batchLabel}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {historyRow && (
        <EntryRevisionHistory row={historyRow} onClose={() => setHistoryRow(null)} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function HistoryBatch({
  group: g,
  open,
  onToggle,
  progress,
  lineStatus,
  onEdit,
  onReuse,
  onHistory,
  canErase,
  batchLabel,
}: {
  group: AuditBatchGroup;
  open: boolean;
  onToggle: () => void;
  progress: ReturnType<typeof progressFor>;
  lineStatus?: LineStatus | null;
  onEdit?: (row: AuditEntryRow) => void;
  onReuse?: (row: AuditEntryRow) => void;
  onHistory?: (row: AuditEntryRow) => void;
  canErase: boolean;
  batchLabel?: (batch: string) => string;
}) {
  const [hoveredLane, setHoveredLane] = useState<string | null>(null);
  const noBatch = g.batch === "(no batch)";
  const dateLine = compactRange(g.dateFrom, g.dateTo);
  const impossible = batchFiguresInconsistent(g);

  return (
    <article className="audit-row" style={{ borderTop: "1px solid var(--border)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: HISTORY_COLS,
          alignItems: "center",
          gap: 12,
          padding: "9px var(--pad-card)",
          border: "none",
          background: open ? "var(--surface-2)" : "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
          transition: "background var(--duration-fast) var(--ease-out)",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 16,
            color: "var(--text-3)",
            fontSize: 9,
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform var(--duration-fast) var(--ease-out)",
          }}
        >
          &#9654;
        </span>

        <BatchIdChip
          batchId={g.batch}
          label={noBatch ? "No batch id" : batchLabel ? batchLabel(g.batch) : g.batch}
          warnSuffix={
            impossible ? (
              <span
                title="Accepted is higher than checked — a gate is missing from this lot, so the two figures cover different lots. Open it to see which gate."
                style={{ marginLeft: 6, color: "var(--warning)", fontFamily: "var(--font-sans)" }}
              >
                &#9888;
              </span>
            ) : null
          }
          style={{ overflow: "hidden" }}
          showDataEntry={false}
        />

        <span className="muted" style={{ fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
          {dateLine}
        </span>

        <span style={{ minWidth: 0 }}>
          <BatchProcessTrack lineStatus={lineStatus} progress={progress} />
        </span>

        <Cell value={g.checkedQty} />
        <Cell value={g.acceptedQty} tone="var(--positive)" />
        <Cell value={g.rejectedQty} tone="var(--critical)" />
      </button>

      {open && (
        <div className="audit-reveal" style={{ padding: "0 var(--pad-card) 16px 46px", display: "grid", gap: 14 }}>
          {lineStatus && lineStatus.lanes.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(lineStatus.lanes.length, 3)}, minmax(0, 1fr))`,
                gap: 10,
                padding: "12px",
                borderRadius: "var(--radius-md, 8px)",
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
              }}
            >
              {lineStatus.lanes.map((lane) => {
                const isPrimary = lane.id === "primary";
                const isDone = lane.complete;
                const isStarted = lane.started && !lane.complete;
                const isHovered = hoveredLane === lane.id;
                const toneColor = isDone
                  ? "var(--positive)"
                  : isStarted
                    ? "var(--status-warn, #d97706)"
                    : "var(--text-3)";
                const capText = isDone
                  ? "COMPLETED"
                  : isStarted
                    ? `${lane.done}/${lane.total} COMPLETE`
                    : "NOT STARTED";
                const subText = isPrimary
                  ? "Production Dipping"
                  : lane.id === "secondary"
                    ? `${lane.done}/${lane.total} Secondary Stages`
                    : `${lane.done}/${lane.total} Assembly Gates`;

                return (
                  <div
                    key={lane.id}
                    onMouseEnter={() => setHoveredLane(lane.id)}
                    onMouseLeave={() => setHoveredLane((prev) => (prev === lane.id ? null : prev))}
                    onClick={() => {
                      const first = g.stages.find((s) => laneForStage(s.stageId) === lane.id);
                      if (first) {
                        const el = document.getElementById(`hist-stage-${g.batch}-${first.stageId}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        const first = g.stages.find((s) => laneForStage(s.stageId) === lane.id);
                        if (first) {
                          const el = document.getElementById(`hist-stage-${g.batch}-${first.stageId}`);
                          el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }
                      }
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-sm, 6px)",
                      background: isHovered
                        ? "color-mix(in srgb, var(--accent) 12%, var(--surface))"
                        : "var(--surface)",
                      border: isHovered
                        ? "1.5px solid var(--accent)"
                        : `1px solid ${
                            isDone
                              ? "color-mix(in srgb, var(--positive) 35%, transparent)"
                              : isStarted
                                ? "color-mix(in srgb, var(--status-warn, #d97706) 35%, transparent)"
                                : "var(--border)"
                          }`,
                      boxShadow: isHovered
                        ? "0 0 0 1px var(--accent), 0 4px 14px color-mix(in srgb, var(--accent) 22%, transparent)"
                        : "none",
                      transform: isHovered ? "translateY(-1px)" : "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      cursor: "pointer",
                      transition: "all 0.18s var(--ease-out)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: toneColor }}>
                        {capText}
                      </span>
                      {isHovered && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)", fontFamily: "var(--font-mono)" }}>
                          View stages ↓
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: isHovered ? "var(--accent)" : "var(--text)" }}>
                      {lane.label}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                      {subText}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {g.stages.map((st, i) => {
            const stLane = laneForStage(st.stageId);
            const isTarget = hoveredLane === stLane;
            const isDimmed = Boolean(hoveredLane) && !isTarget;
            const laneLabel = lineStatus?.lanes.find((l) => l.id === stLane)?.label ?? stLane;

            return (
              <div
                id={`hist-stage-${g.batch}-${st.stageId}`}
                key={st.stageId}
                className="fade-up"
                onMouseEnter={() => setHoveredLane(stLane)}
                onMouseLeave={() => setHoveredLane((prev) => (prev === stLane ? null : prev))}
                style={{
                  animationDelay: `${Math.min(i, 4) * 40}ms`,
                  opacity: isDimmed ? 0.35 : 1,
                  filter: isDimmed ? "grayscale(40%)" : "none",
                  padding: isTarget ? "10px 12px" : "0",
                  borderRadius: "var(--radius-md, 8px)",
                  border: isTarget ? "1.5px solid var(--accent)" : "1.5px solid transparent",
                  background: isTarget ? "color-mix(in srgb, var(--accent) 6%, transparent)" : "transparent",
                  boxShadow: isTarget ? "0 0 0 1px var(--accent), 0 4px 14px color-mix(in srgb, var(--accent) 15%, transparent)" : "none",
                  transition: "all 0.18s var(--ease-out)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "4px 10px",
                    marginBottom: 6,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 600, color: isTarget ? "var(--accent)" : "var(--text)" }}>
                    {stageLabel(st.stageId)}
                  </h3>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: isTarget ? "var(--accent-weak)" : "var(--surface-2)",
                      color: isTarget ? "var(--accent)" : "var(--text-3)",
                      border: isTarget ? "1px solid color-mix(in srgb, var(--accent) 40%, var(--border))" : "1px solid var(--border)",
                      transition: "all 0.18s var(--ease-out)",
                    }}
                  >
                    {laneLabel}
                  </span>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {st.rowCount} row{st.rowCount === 1 ? "" : "s"} · <Num>{st.checkedQty.toLocaleString()}</Num>{" "}
                    checked
                    {st.rejectedQty > 0 && (
                      <>
                        {" · "}
                        <Num tone="var(--critical)">{st.rejectedQty.toLocaleString()}</Num> rejected
                      </>
                    )}
                  </span>
                </div>

              <div style={{ display: "grid", gap: 8 }}>
                {st.rows.map((r) => {
                  const rate = r.checked ? (r.rejected / r.checked) * 100 : 0;
                  const edited = r.hasCorrection || r.revisionCount > 1;
                  return (
                    <article
                      key={r.id}
                      style={{
                        position: "relative",
                        border: "1px solid var(--border-strong)",
                        borderRadius: 10,
                        background: "var(--bg)",
                        padding: "12px 14px",
                        paddingRight: 44,
                      }}
                    >
                      {onHistory && (
                        <button
                          type="button"
                          onClick={() => onHistory(r)}
                          aria-label="View edit history"
                          title="Edit history"
                          style={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            width: 28,
                            height: 28,
                            padding: 0,
                            borderRadius: 8,
                            border: edited
                              ? "1px solid color-mix(in srgb, var(--accent) 45%, var(--border-strong))"
                              : "1px solid var(--border-strong)",
                            background: edited ? "var(--accent-weak)" : "var(--surface)",
                            color: edited ? "var(--accent)" : "var(--text-2)",
                            display: "grid",
                            placeItems: "center",
                            cursor: "pointer",
                          }}
                        >
                          <Icon name="history" size={14} stroke={1.8} />
                        </button>
                      )}
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "6px 14px",
                          alignItems: "baseline",
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: 700, color: "var(--text)" }}>{fmtDate(r.date)}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>
                          {r.size ?? "—"}
                        </span>
                        {/* Category and Type. Recorded on every event since the
                            form had those controls, and printed nowhere on this
                            screen — which read as "it was never saved". */}
                        {describeProductType(r.productType) && (
                          <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                            {describeProductType(r.productType)}
                          </span>
                        )}
                        <span className="muted" style={{ fontSize: 12 }}>
                          Saved {fmtStamp(r.recordedAt)}
                          {edited ? " · edited" : ""}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: r.rework > 0 ? "repeat(4, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
                          gap: 8,
                          marginBottom: r.defects.length ? 8 : 0,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
                            Checked
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                            {r.checked.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
                            Accepted
                          </div>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--positive)" }}>
                            {r.accepted.toLocaleString()}
                          </div>
                        </div>
                        {r.rework > 0 && (
                          <div>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
                              Hold
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--warning)" }}>
                              {r.rework.toLocaleString()}
                            </div>
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
                            Rejected
                          </div>
                          <div
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              color: r.rejected > 0 ? "var(--critical)" : "var(--text-3)",
                            }}
                            title={r.checked ? `${rate.toFixed(2)}% of checked` : undefined}
                          >
                            {r.rejected.toLocaleString()}
                          </div>
                        </div>
                      </div>
                      {r.defects.length > 0 && (
                        <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, marginBottom: onEdit || onReuse ? 8 : 0 }}>
                          {r.defects.map((d) => (
                            <span key={d.code} style={defectChip}>
                              {d.code} <b style={{ fontFamily: "var(--font-mono)" }}>{d.qty}</b>
                            </span>
                          ))}
                        </div>
                      )}
                      {(onEdit || onReuse) && (
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 10 }}>
                          {onEdit && (
                            <button type="button" onClick={() => onEdit(r)} style={linkBtn}>
                              Edit
                            </button>
                          )}
                          {onReuse && (
                            <button type="button" onClick={() => onReuse(r)} style={linkBtn}>
                              Reuse lot
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}

          <p className="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
            <a
              href={`/audit?batch=${encodeURIComponent(g.batch)}`}
              style={{ color: "var(--accent)", fontWeight: 600 }}
            >
              Open in Audit trail
            </a>{" "}
            {canErase
              ? "for provenance, comments and the erase action."
              : "for provenance and comments."}
          </p>
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */

function SegGroup({
  label,
  value,
  onChange,
  options,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  /** Mono digits for codes like French sizes, so widths stay even. */
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--text-3)", fontWeight: 600 }}>{label}</span>
      <div role="group" aria-label={label} style={{ display: "flex", gap: 2 }}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              style={{
                padding: "4px 10px",
                minHeight: 28,
                border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius-pill)",
                background: on ? "var(--accent-weak)" : "transparent",
                color: on ? "var(--accent-text)" : "var(--text-2)",
                fontSize: "var(--text-xs)",
                fontWeight: on ? 700 : 500,
                cursor: "pointer",
                fontFamily: mono ? "var(--font-mono)" : "inherit",
                transition:
                  "background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ searching, query, scope }: { searching: boolean; query: string; scope: SourceScope }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", display: "grid", gap: 8, justifyItems: "center" }}>
      <p style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 600 }}>
        {searching ? `Nothing matches “${query}”` : "No batches saved yet"}
      </p>
      <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)", maxWidth: "44ch", lineHeight: "var(--leading-body)" }}>
        {searching
          ? "Try a batch id like 26F27-14, a stage name, or a defect code."
          : scope === "mine"
            ? "Batches you save under Log a batch appear here, with a progress bar showing which assembly gates are done."
            : "Nothing in the ledger for this filter yet — import a workbook or log a batch."}
      </p>
    </div>
  );
}

function Num({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: tone ?? "var(--text)" }}>
      {children}
    </span>
  );
}

const th: React.CSSProperties = {
  padding: "6px 10px",
  fontWeight: 600,
  whiteSpace: "nowrap",
  textTransform: "none",
};

const td: React.CSSProperties = {
  padding: "8px 10px",
  color: "var(--text-2)",
  verticalAlign: "top",
};

const numCell: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const defectChip: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  padding: "1px 7px",
  borderRadius: "var(--radius-pill)",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  fontSize: "var(--text-xs)",
  color: "var(--text-2)",
  whiteSpace: "nowrap",
};

const linkBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  fontFamily: "inherit",
  padding: "2px 4px",
};

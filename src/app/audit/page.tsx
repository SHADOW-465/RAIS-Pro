"use client";

/**
 * Hallmark · product · workbench audit ledger
 * tone: operational · simple · scannable
 * Pattern: Batch accordion → stage tabs → sheet grid (one stage at a time)
 */

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  describeProductType,
  CATHETER_CATEGORIES,
  CATHETER_TYPES,
  categoryAndTypeFrom,
  sizesFor,
} from "@/lib/entry/disposafe-matrix";
import { useEvents } from "@/components/app/EventsContext";
import DatePicker from "@/components/ui/DatePicker";
import { useConfirm } from "@/components/ui/ConfirmContext";
import AppShell from "@/components/app/AppShell";
import Icon from "@/components/editorial/Icon";
import {
  batchOf,
  buildEntryRows,
  filterEntryRows,
  filterEventsByDatePreset,
  filterSessions,
  groupAuditSessions,
  groupByBatchThenStage,
  isDirectEntry,
  batchFiguresInconsistent,
  listRowSizes,
  type AuditBatchGroup,
  type AuditDatePreset,
  type AuditEntryRow,
  type AuditSession,
  type AuditStageBucket,
} from "@/lib/analytics/audit-sessions";
import {
  buildBatchProgress,
  progressFor,
  type BatchProgress,
} from "@/lib/analytics/batch-progress";
import LotProgress from "@/components/LotProgress";
import EntryRevisionHistory from "@/components/entry/EntryRevisionHistory";
import { usePersona } from "@/components/app/PersonaContext";
import Select from "@/components/ui/Select";
import { sortStageIds } from "@/core/ontology/plant-catalog";
import {
  integrityFixHref,
  parseIntegrityFocus,
  rowMatchesIntegrityFocus,
  type IntegrityFocus,
  type IntegrityIssue,
} from "@/lib/analytics/integrity";

type ViewMode = "batch" | "sessions" | "raw";

/**
 * One shared column template for the batch list: chevron / id / dates /
 * progress / checked / accepted / rejected / rate. The header strip and every
 * row read from this, so the numbers stay in aligned columns instead of
 * wrapping as free text — 78 stacked cards were unscannable.
 */
/** "15–31 Jul" / "15 Jul – 2 Aug" / "15 Jul". Full ISO on both ends was the
 *  widest column on the row and the least-read information on it. */
function compactRange(from: string, to: string): string {
  const fmt = (iso: string, withMonth: boolean) => {
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    const day = d.getUTCDate();
    return withMonth
      ? `${day} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`
      : String(day);
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return from;
  if (from === to) return fmt(from, true);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${fmt(from, !sameMonth)}–${fmt(to, true)}`;
}

const AUDIT_ROW_COLS = "16px minmax(96px, 1.1fr) minmax(94px, 0.9fr) 150px 78px 78px 78px 62px";

/** "31 Jul, 09:56" — the wall-clock moment a row was written. */
function fmtStamp(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Right-aligned tabular figure. Zero renders as a dash, not a loud 0. */
function Num({ value, tone }: { value: number; tone?: string }) {
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
      {value > 0 ? value.toLocaleString() : "—"}
    </span>
  );
}

/** Rejection rate — the number a QM actually scans for. */
function Rate({ checked, rejected }: { checked: number; rejected: number }) {
  if (!checked || !rejected) {
    return <span style={{ textAlign: "right", color: "var(--text-3)", fontSize: "var(--text-sm)" }}>—</span>;
  }
  const r = (rejected / checked) * 100;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        textAlign: "right",
        fontVariantNumeric: "tabular-nums",
        color: r >= 5 ? "var(--critical)" : r >= 2 ? "var(--warning)" : "var(--text-2)",
      }}
    >
      {r.toFixed(1)}%
    </span>
  );
}

function stageLabel(id: string): string {
  const map: Record<string, string> = {
    visual: "Visual",
    "eye-punching": "Eye punching",
    balloon: "Balloon",
    "valve-integrity": "Valve Integrity",
    final: "Final",
    "(unknown stage)": "Unknown",
  };
  return map[id] ?? id;
}

export default function AuditPage() {
  const { events: contextEvents, isLoading: loading, refreshEvents } = useEvents();
  const events = (contextEvents ?? []) as any[];
  const { canEraseLedger } = usePersona();

  const [viewMode, setViewMode] = useState<ViewMode>("batch");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  /** Lot completion, same vocabulary as Data Entry -> History. */
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "complete">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeStoredFilter, setTypeStoredFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "batch-asc" | "batch-desc" | "volume-desc" | "rejection-desc">("newest");
  const [page, setPage] = useState(0);

  /** Which batches are expanded */
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  /** Active stage tab per open batch */
  const [stageTab, setStageTab] = useState<Record<string, string>>({});
  const [openSession, setOpenSession] = useState<string | null>(null);
  /** Deep-link focus from Schema (or Jump palette) */
  const [focusIssue, setFocusIssue] = useState<IntegrityFocus | null>(null);
  const focusApplied = useRef(false);

  const PAGE = 15;

  /** Consume ?code=&batch=&stage=&date=… once on mount */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const focus = parseIntegrityFocus(params);
    if (!focus) return;

    setFocusIssue(focus);
    setViewMode("batch");
    setDateFrom("");
    setDateTo("");
    if (focus.stageId) setStageFilter(focus.stageId);
    // Prefer batch for search; fall back to date so the list narrows
    if (focus.batch) setSearchQuery(focus.batch);
    else if (focus.date) setSearchQuery(focus.date);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, typeFilter, stageFilter, sourceFilter, sizeFilter, statusFilter, categoryFilter, typeStoredFilter, sortOrder, dateFrom, dateTo, viewMode]);

  const commentsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of events) {
      if (e.eventType === "annotation" && e.text && Array.isArray(e.targetEventIds)) {
        for (const id of e.targetEventIds as string[]) {
          const list = map.get(id) ?? [];
          list.push(e.text);
          map.set(id, list);
        }
      }
    }
    return map;
  }, [events]);

  /** Summary strip: batches + data-entry count + distinct Excel uploads only. */
  const sourceStats = useMemo(() => {
    let dataEntries = 0;
    const excelFiles = new Set<string>();
    for (const e of events) {
      if (e.eventType === "annotation") continue;
      if (isDirectEntry(e)) {
        dataEntries += 1;
        continue;
      }
      const key =
        (e.provenance?.fileHash as string | undefined) ||
        (e.provenance?.file as string | undefined) ||
        null;
      if (key) excelFiles.add(key);
    }
    return { dataEntries, excelFiles: excelFiles.size };
  }, [events]);

  const stageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.stageId) set.add(e.stageId);
    return sortStageIds([...set]);
  }, [events]);

  const datedEvents = useMemo(() => {
    if (!dateFrom && !dateTo) return events;
    return events.filter((e) => {
      const biz = e.occurredOn?.start ?? "";
      const rec = e.recordedAt ? e.recordedAt.slice(0, 10) : "";
      const d = biz || rec;
      if (!d) return true;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [events, dateFrom, dateTo]);

  const allRows = useMemo(
    () => buildEntryRows(datedEvents, commentsMap),
    [datedEvents, commentsMap],
  );

  /** Offer only sizes that actually exist in range — never a dead option. */
  const sizeOptions = useMemo(() => listRowSizes(allRows), [allRows]);

  /** Valid sizes allowed by the current Category and Type filter. */
  const validSizesForSelection = useMemo(() => {
    if (categoryFilter === "Female") return sizesFor("Female", "2 way");
    if (categoryFilter === "Peadiatric") return sizesFor("Peadiatric", "2 way");
    if (categoryFilter === "Male") {
      return sizesFor("Male", typeStoredFilter === "3 way" ? "3 way" : "2 way");
    }
    if (typeStoredFilter === "3 way") return sizesFor("Male", "3 way");
    return null;
  }, [categoryFilter, typeStoredFilter]);

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

  // Reset size if invalid for new category
  useEffect(() => {
    if (sizeFilter !== "all" && availableSizeOptions.length > 0 && !availableSizeOptions.includes(sizeFilter)) {
      setSizeFilter("all");
    }
  }, [availableSizeOptions, sizeFilter]);

  // If Female or Peadiatric is selected, reset type if it was 3-way
  useEffect(() => {
    if ((categoryFilter === "Female" || categoryFilter === "Peadiatric") && typeStoredFilter === "3 way") {
      setTypeStoredFilter("all");
    }
  }, [categoryFilter, typeStoredFilter]);

  const typeOptions = useMemo(() => {
    if (categoryFilter === "Female" || categoryFilter === "Peadiatric") {
      return [{ value: "all", label: "2 way" }];
    }
    return [
      { value: "all", label: "All types" },
      ...CATHETER_TYPES.map((t) => ({ value: t, label: t })),
    ];
  }, [categoryFilter]);

  const entryRows = useMemo(
    () => {
      let rows = filterEntryRows(allRows, {
        source: sourceFilter as "all" | "manual" | "excel",
        stageId: stageFilter,
        size: sizeFilter,
        search: searchQuery,
      });
      if (categoryFilter !== "all" || typeStoredFilter !== "all") {
        rows = rows.filter((r) => {
          const { category, type } = categoryAndTypeFrom(r.productType);
          if (categoryFilter !== "all" && category !== categoryFilter) return false;
          if (typeStoredFilter !== "all" && type !== typeStoredFilter) return false;
          return true;
        });
      }
      return rows;
    },
    [allRows, sourceFilter, stageFilter, sizeFilter, categoryFilter, typeStoredFilter, searchQuery],
  );

  /** Lot completion — over ALL events, never the filtered set, or a stage filter
   *  would make every lot look unfinished. */
  const batchProgress = useMemo(() => buildBatchProgress(events), [events]);

  const batchGroups = useMemo(() => {
    let groups = groupByBatchThenStage(entryRows);
    if (statusFilter !== "all") {
      groups = groups.filter((g) => {
        const complete = progressFor(batchProgress, g.batch)?.status === "complete";
        return statusFilter === "complete" ? complete : !complete;
      });
    }
    return [...groups].sort((a, b) => {
      if (sortOrder === "newest") return b.dateTo.localeCompare(a.dateTo) || a.batch.localeCompare(b.batch);
      if (sortOrder === "oldest") return a.dateFrom.localeCompare(b.dateFrom) || a.batch.localeCompare(b.batch);
      if (sortOrder === "batch-asc") return a.batch.localeCompare(b.batch);
      if (sortOrder === "batch-desc") return b.batch.localeCompare(a.batch);
      if (sortOrder === "volume-desc") return b.checkedQty - a.checkedQty || a.batch.localeCompare(b.batch);
      if (sortOrder === "rejection-desc") return b.rejectedQty - a.rejectedQty || a.batch.localeCompare(b.batch);
      return 0;
    });
  }, [entryRows, statusFilter, sortOrder, batchProgress]);

  /**
   * Erase a displayed row from the ledger. This is the ONLY erase path in the
   * product: Data Entry can save and read back, but unsaving happens here,
   * next to the provenance that justifies it, and only for a GM.
   *
   * ponytail: gated in the UI only — the API has no auth to check against yet.
   * Move this to a server-side role check the moment real auth lands.
   */
  const { confirm: confirmModal, notify } = useConfirm();
  const [erasing, setErasing] = useState<string | null>(null);
  const eraseRow = useCallback(
    async (row: AuditEntryRow) => {
      const shifts = row.shifts.length ? row.shifts : ["Day Shift"];
      const ok = await confirmModal({
        title: "Permanently erase this row?",
        description:
          `${row.date} · ${row.batch} · ${row.stageId}${row.size ? ` · ${row.size}` : ""}\n` +
          `${row.checked.toLocaleString()} checked, ${row.rejected.toLocaleString()} rejected\n\n` +
          "The numbers leave the dashboard and every analysis. This is an erase, " +
          "not a correction, and cannot be undone.",
        confirmText: "Erase Ledger Row",
        variant: "danger",
      });
      if (!ok) return;

      setErasing(row.id);
      try {
        let deleted = 0;
        for (const shift of shifts) {
          const qs = new URLSearchParams({ date: row.date, shift });
          if (row.batch && row.batch !== "(no batch)") qs.set("batch", row.batch.toUpperCase());
          if (row.stageId && row.stageId !== "(unknown stage)") qs.set("stageId", row.stageId);
          if (row.size) qs.set("size", row.size);
          const res = await fetch(`/api/manual-entries?${qs}`, { method: "DELETE" });
          const body = await res.json().catch(() => ({}) as { error?: string; deletedCount?: number });
          if (!res.ok) throw new Error(body.error ?? "Erase failed");
          deleted += body.deletedCount ?? 0;
        }
        if (deleted === 0) throw new Error("No matching ledger events — it may already be gone.");
        notify("Row erased from ledger", "success");
        await refreshEvents();
      } catch (e) {
        notify(`Could not erase: ${e instanceof Error ? e.message : "unknown error"}`, "error");
      } finally {
        setErasing(null);
      }
    },
    [refreshEvents, confirmModal, notify],
  );

  const sessions = useMemo(() => {
    return filterSessions(groupAuditSessions(datedEvents, commentsMap), {
      source: sourceFilter as "all" | "manual" | "excel",
      stageId: stageFilter,
      search: searchQuery,
      commentsMap,
    });
  }, [datedEvents, commentsMap, sourceFilter, stageFilter, searchQuery]);

  const rawEvents = useMemo(() => {
    const list = datedEvents.filter((e) => {
      if (e.eventType === "annotation") return false;
      if (typeFilter !== "all" && e.eventType !== typeFilter) return false;
      if (stageFilter !== "all" && e.stageId !== stageFilter) return false;
      if (sourceFilter === "manual" && !isDirectEntry(e)) return false;
      if (sourceFilter === "excel" && isDirectEntry(e)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          e.eventId?.toLowerCase().includes(q) ||
          e.stageId?.toLowerCase().includes(q) ||
          batchOf(e)?.toLowerCase().includes(q) ||
          e.provenance?.file?.toLowerCase().includes(q) ||
          e.defectCodeRaw?.toLowerCase().includes(q)
        );
      }
      return true;
    });
    const ts = (e: any) => e.recordedAt ?? e.occurredOn?.start ?? "";
    return list.sort((a, b) => ts(b).localeCompare(ts(a)));
  }, [datedEvents, typeFilter, stageFilter, sourceFilter, searchQuery]);

  /**
   * Auto-open first batch only once after data loads.
   * Prefer focus-issue match when deep-linked from Schema.
   * Must NOT re-run when openBatch becomes null — that re-opened on every close (glitch).
   */
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (viewMode !== "batch") {
      didAutoOpen.current = false;
      focusApplied.current = false;
      return;
    }
    if (batchGroups.length === 0) return;

    // Focus path: apply once when groups + focus are ready
    if (focusIssue && !focusApplied.current) {
      focusApplied.current = true;
      didAutoOpen.current = true;
      const match =
        (focusIssue.batch
          ? batchGroups.find((g) => g.batch === focusIssue.batch)
          : null) ??
        (focusIssue.date
          ? batchGroups.find(
              (g) =>
                g.dateFrom <= (focusIssue.date as string) &&
                g.dateTo >= (focusIssue.date as string)
            )
          : null) ??
        batchGroups[0];
      setOpenBatch(match.batch);
      const stageId =
        focusIssue.stageId && match.stages.some((s) => s.stageId === focusIssue.stageId)
          ? focusIssue.stageId
          : match.stages[0]?.stageId;
      if (stageId) {
        setStageTab((t) => ({ ...t, [match.batch]: stageId }));
      }
      // Keep focused batch on page 1 of pagination
      const idx = batchGroups.findIndex((g) => g.batch === match.batch);
      if (idx >= 0) setPage(Math.floor(idx / PAGE));
      // Scroll first highlighted row into view after paint
      requestAnimationFrame(() => {
        const el = document.querySelector("[data-integrity-hit='1']");
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    if (didAutoOpen.current || focusIssue) return;
    didAutoOpen.current = true;
    const first = batchGroups[0];
    setOpenBatch(first.batch);
    if (first.stages[0]) {
      setStageTab((t) => ({ ...t, [first.batch]: first.stages[0].stageId }));
    }
  }, [viewMode, batchGroups, focusIssue]);

  /** If open batch disappears after filter change, clear selection (don't force another open). */
  useEffect(() => {
    if (!openBatch) return;
    if (!batchGroups.some((g) => g.batch === openBatch)) {
      setOpenBatch(null);
    }
  }, [batchGroups, openBatch]);

  const selectBatch = useCallback(
    (batch: string) => {
      setOpenBatch((cur) => {
        if (cur === batch) return null; // close — stays closed
        return batch;
      });
      const g = batchGroups.find((b) => b.batch === batch);
      if (g?.stages[0]) {
        setStageTab((t) => ({ ...t, [batch]: t[batch] || g.stages[0].stageId }));
      }
    },
    [batchGroups]
  );

  const pageItems =
    viewMode === "batch" ? batchGroups : viewMode === "sessions" ? sessions : rawEvents;
  const pageSlice = pageItems.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.max(1, Math.ceil(pageItems.length / PAGE));

  return (
    <AppShell active="audit">
      <div style={{ maxWidth: 1080, margin: "0 auto", paddingBottom: 56 }}>
        {/* —— Header —— */}
        <header style={{ marginBottom: 20 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              color: "var(--text)",
              lineHeight: 1.2,
            }}
          >
            Audit trail
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: "var(--text-2)",
              lineHeight: 1.45,
              maxWidth: 36 * 16,
            }}
          >
            Find a batch, pick a stage, read the entries. Same ledger — clearer path.
          </p>
        </header>

        {/* —— Summary: batches + source mix only —— */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <StatPill
            label="Batches"
            value={String(batchGroups.length)}
            hint="Open one · pick a stage"
            tone="neutral"
          />
          <StatPill
            label="Data entries"
            value={sourceStats.dataEntries}
            hint="Manual / Data Entry ledger facts"
            tone="accent"
          />
          <StatPill
            label="Excel files"
            value={sourceStats.excelFiles}
            hint="Distinct uploaded workbooks"
            tone="neutral"
          />
        </div>

        {/* —— Toolbar —— */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 12,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            marginBottom: 16,
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <SegControl
              value={viewMode}
              onChange={setViewMode}
              options={[
                { id: "batch", label: "By batch" },
                { id: "sessions", label: "By upload" },
                { id: "raw", label: "Raw" },
              ]}
            />
            <div style={{ flex: 1 }} />
            <AuditCustomRangePill
              dateFrom={dateFrom}
              setDateFrom={setDateFrom}
              dateTo={dateTo}
              setDateTo={setDateTo}
            />
          </div>

          {/* Search stays wide; every filter is a fixed, equal track so the row
              stays a readable rank of controls as options come and go. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 1.6fr) repeat(auto-fit, minmax(132px, 1fr))",
              gap: 8,
            }}
          >
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search batch number…"
            />
            <Select
              value={sourceFilter}
              onChange={setSourceFilter}
              options={[
                { value: "all", label: "All sources" },
                { value: "manual", label: "Data entry" },
                { value: "excel", label: "Excel" },
              ]}
              ariaLabel="Filter by source"
            />
            <Select
              value={stageFilter}
              onChange={setStageFilter}
              options={[
                { value: "all", label: "All stages" },
                ...stageOptions.map((s) => ({ value: s, label: stageLabel(s) })),
              ]}
              ariaLabel="Filter by stage"
            />
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "all", label: "All categories" },
                ...CATHETER_CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
              ariaLabel="Filter by category"
            />
            <Select
              value={typeStoredFilter}
              onChange={setTypeStoredFilter}
              options={typeOptions}
              ariaLabel="Filter by product type"
            />
            {availableSizeOptions.length > 0 && (
              <Select
                value={sizeFilter}
                onChange={setSizeFilter}
                options={[
                  { value: "all", label: "All sizes" },
                  ...availableSizeOptions.map((sz) => ({ value: sz, label: sz })),
                ]}
                mono
                ariaLabel="Filter by size"
              />
            )}
            <Select
              value={sortOrder}
              onChange={(v) => setSortOrder(v as any)}
              options={[
                { value: "newest", label: "Sort: Newest" },
                { value: "oldest", label: "Sort: Oldest" },
                { value: "batch-asc", label: "Sort: Batch A–Z" },
                { value: "batch-desc", label: "Sort: Batch Z–A" },
                { value: "volume-desc", label: "Sort: Volume High–Low" },
                { value: "rejection-desc", label: "Sort: Rejection High–Low" },
              ]}
              ariaLabel="Sort order"
            />
            {/* Lot completion is a batch-level idea, so it is offered only where
                the list is batches. */}
            {viewMode === "batch" && (
              <Select
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as "all" | "open" | "complete")}
                options={[
                  { value: "all", label: "Any status" },
                  { value: "open", label: "In progress" },
                  { value: "complete", label: "Complete" },
                ]}
                ariaLabel="Filter by lot status"
              />
            )}
            {viewMode === "raw" && (
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: "all", label: "All event types" },
                  { value: "production", label: "Production" },
                  { value: "inspection", label: "Inspection" },
                  { value: "rejection", label: "Rejection" },
                ]}
                ariaLabel="Filter by event type"
              />
            )}
          </div>
        </div>

        {/* —— Focus chip when deep-linked from Schema —— */}
        {focusIssue && (
          <FocusIssueBanner
            focus={focusIssue}
            onDismiss={() => {
              setFocusIssue(null);
              // Clear query so refresh doesn't re-focus
              if (typeof window !== "undefined") {
                const url = new URL(window.location.href);
                [
                  "code",
                  "stage",
                  "date",
                  "size",
                  "batch",
                  "msg",
                  "sev",
                  "stated",
                  "computed",
                  "view",
                  "range",
                ].forEach((k) => url.searchParams.delete(k));
                window.history.replaceState({}, "", url.pathname + (url.search || ""));
              }
            }}
          />
        )}

        {/* —— List —— */}
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                {viewMode === "batch" && "Batches"}
                {viewMode === "sessions" && "Uploads & saves"}
                {viewMode === "raw" && "Event log"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                {viewMode === "batch" && "Open a batch, then switch stage tabs to read the sheet"}
                {viewMode === "sessions" && "Open an upload to see every event in that save"}
                {viewMode === "raw" && "Full technical ledger"}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              {pageItems.length} item{pageItems.length === 1 ? "" : "s"}
            </div>
          </div>

          {loading ? (
            <Empty text="Loading…" />
          ) : pageItems.length === 0 ? (
            <Empty text="No matching records. Widen the date range or clear search." />
          ) : viewMode === "batch" ? (
            <div>
              {/* Column header — the rows below are a table, so label them once
                  instead of repeating "checked / accepted / rejected" on every
                  single row the way the old card layout did. */}
              <div
                aria-hidden="true"
                style={{
                  display: "grid",
                  gridTemplateColumns: AUDIT_ROW_COLS,
                  gap: 12,
                  padding: "6px 16px",
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
                <span>Gates</span>
                <span style={{ textAlign: "right" }}>Checked</span>
                <span style={{ textAlign: "right" }}>Accepted</span>
                <span style={{ textAlign: "right" }}>Rejected</span>
                <span style={{ textAlign: "right" }}>Rate</span>
              </div>
              {(pageSlice as AuditBatchGroup[]).map((g) => (
                <BatchAccordion
                  key={g.batch}
                  group={g}
                  open={openBatch === g.batch}
                  activeStage={stageTab[g.batch] ?? g.stages[0]?.stageId ?? ""}
                  onToggle={() => selectBatch(g.batch)}
                  onStage={(sid) => setStageTab((t) => ({ ...t, [g.batch]: sid }))}
                  progress={progressFor(batchProgress, g.batch)}
                  onErase={canEraseLedger ? eraseRow : undefined}
                  erasingId={erasing}
                  focus={focusIssue}
                />
              ))}
            </div>
          ) : viewMode === "sessions" ? (
            <div>
              {(pageSlice as AuditSession[]).map((s) => (
                <SessionAccordion
                  key={s.id}
                  session={s}
                  open={openSession === s.id}
                  onToggle={() => setOpenSession((c) => (c === s.id ? null : s.id))}
                  commentsMap={commentsMap}
                />
              ))}
            </div>
          ) : (
            <RawTable rows={pageSlice as any[]} />
          )}

          {pageItems.length > PAGE && (
            <Pager
              page={page}
              totalPages={totalPages}
              total={pageItems.length}
              pageSize={PAGE}
              onPage={setPage}
            />
          )}
        </section>
      </div>
    </AppShell>
  );
}

/* ===================== Batch accordion ===================== */

function BatchAccordion({
  group: g,
  open,
  activeStage,
  onToggle,
  onStage,
  progress,
  onErase,
  erasingId,
  focus,
}: {
  group: AuditBatchGroup;
  open: boolean;
  activeStage: string;
  onToggle: () => void;
  onStage: (stageId: string) => void;
  progress?: BatchProgress | null;
  /** Present only when the current role may erase ledger rows (GM). */
  onErase?: (row: AuditEntryRow) => void;
  erasingId?: string | null;
  focus?: IntegrityFocus | null;
}) {
  const stage: AuditStageBucket | undefined =
    g.stages.find((s) => s.stageId === activeStage) ?? g.stages[0];
  const dateLine = compactRange(g.dateFrom, g.dateTo);
  const impossible = batchFiguresInconsistent(g);
  const noBatch = g.batch === "(no batch)";
  const hasReject = g.rejectedQty > 0;

  return (
    <article
      className="audit-row"
      style={{
        borderTop: "1px solid var(--border)",
        // Closed rows stay plain. Tinting every row that has any rejection made
        // 78 of 78 rows red, which carries no information — the Rate column
        // already says which ones are actually bad.
        background: open ? "var(--surface-2)" : "var(--surface)",
        transition: "background var(--duration-fast) var(--ease-out)",
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        aria-expanded={open}
        className="audit-batch-row"
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: AUDIT_ROW_COLS,
          alignItems: "center",
          gap: 12,
          padding: "9px 16px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <Chevron open={open} tone={hasReject ? "critical" : "accent"} />

        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-md)",
            fontWeight: 700,
            letterSpacing: "0.03em",
            color: noBatch ? "var(--text-3)" : "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {noBatch ? "No batch" : g.batch}
          {impossible && (
            <span
              title="Accepted is higher than checked — a gate is missing from this lot, so these two figures are measured over different lots. Open the batch to see which gate."
              style={{ marginLeft: 6, color: "var(--warning)", fontFamily: "var(--font-sans)" }}
            >
              &#9888;
            </span>
          )}
        </span>

        <span className="small" style={{ fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>
          {dateLine}
        </span>

        <span style={{ minWidth: 0 }}>
          {progress && progress.doneCount > 0 ? (
            <LotProgress progress={progress} showLabels={false} />
          ) : (
            <span className="small" style={{ fontSize: "var(--text-2xs)" }}>
              {g.stages.length} stage{g.stages.length === 1 ? "" : "s"}
            </span>
          )}
        </span>

        <Num value={g.checkedQty} />
        <Num value={g.acceptedQty} tone="var(--positive)" />
        <Num value={g.rejectedQty} tone={hasReject ? "var(--critical)" : undefined} />
        <Rate checked={g.checkedQty} rejected={g.rejectedQty} />
      </button>

      {open && stage && (
        <div
          className="audit-reveal"
          style={{
            padding: "4px 16px 16px 52px",
            borderTop: "1px solid var(--border)",
          }}
        >
          {/* Stage tabs */}
          <div
            role="tablist"
            aria-label="Stages in this batch"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              padding: "4px 0 12px",
            }}
          >
            {g.stages.map((st) => {
              const on = st.stageId === stage.stageId;
              const stageReject = st.rows.reduce((n, r) => n + (r.rejected || 0), 0);
              return (
                <button
                  key={st.stageId}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStage(st.stageId);
                  }}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 999,
                    border: on
                      ? stageReject > 0
                        ? "1px solid color-mix(in srgb, var(--critical) 35%, var(--border))"
                        : "1px solid color-mix(in srgb, var(--accent) 40%, var(--border))"
                      : "1px solid var(--border)",
                    background: on
                      ? stageReject > 0
                        ? "var(--critical-weak)"
                        : "var(--accent-weak)"
                      : "var(--surface)",
                    color: on
                      ? stageReject > 0
                        ? "var(--critical)"
                        : "var(--accent)"
                      : "var(--text-2)",
                    boxShadow: on ? "var(--shadow-1)" : "none",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition:
                      "background 0.15s var(--ease-out), color 0.15s var(--ease-out), box-shadow 0.15s var(--ease-out)",
                  }}
                >
                  {stageLabel(st.stageId)}
                  <span
                    style={{
                      marginLeft: 6,
                      opacity: 0.85,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {st.rowCount}
                  </span>
                </button>
              );
            })}
          </div>

          <div key={stage.stageId} className="audit-reveal">
            <EntryGrid
              rows={stage.rows}
              stageName={stageLabel(stage.stageId)}
              stageId={stage.stageId}
              batch={g.batch}
              onErase={onErase}
              erasingId={erasingId}
              focus={focus}
            />
          </div>
        </div>
      )}
    </article>
  );
}

function EntryGrid({
  rows,
  stageName: name,
  stageId,
  batch,
  onErase,
  erasingId,
  focus,
}: {
  rows: AuditEntryRow[];
  stageName: string;
  stageId?: string;
  batch?: string;
  onErase?: (row: AuditEntryRow) => void;
  erasingId?: string | null;
  focus?: IntegrityFocus | null;
}) {
  const [historyRow, setHistoryRow] = useState<AuditEntryRow | null>(null);
  const anyFocus =
    !!focus &&
    rows.some((r) =>
      rowMatchesIntegrityFocus({ date: r.date, size: r.size, stageId, batch }, focus)
    );

  return (
    <div
      style={{
        background: "var(--surface)",
        border: anyFocus
          ? "1px solid color-mix(in srgb, var(--critical) 35%, var(--border))"
          : "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: anyFocus
          ? "0 0 0 3px color-mix(in srgb, var(--critical-weak) 80%, transparent)"
          : "none",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          fontWeight: 600,
          color: anyFocus ? "var(--critical)" : "var(--text-3)",
          letterSpacing: "0.02em",
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>
          {name} · {rows.length} entr{rows.length === 1 ? "y" : "ies"}
          {" · "}
          values are current (superseded history via History)
        </span>
        {anyFocus && (
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11 }}>
            {focus?.code} matched
          </span>
        )}
      </div>
      <div style={{ display: "grid", gap: 8, padding: 10 }}>
        {rows.map((r) => {
          const hit = !!(
            focus &&
            rowMatchesIntegrityFocus({ date: r.date, size: r.size, stageId, batch }, focus)
          );
          const edited = r.hasCorrection || r.revisionCount > 1;
          return (
            <article
              key={r.id}
              data-integrity-hit={hit ? "1" : undefined}
              style={{
                position: "relative",
                border: hit
                  ? "1.5px solid color-mix(in srgb, var(--critical) 45%, var(--border))"
                  : "1px solid var(--border-strong)",
                borderRadius: 10,
                background: hit
                  ? "color-mix(in srgb, var(--critical-weak) 70%, var(--surface))"
                  : "var(--bg)",
                padding: "12px 14px",
                paddingRight: onErase ? 72 : 44,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => setHistoryRow(r)}
                  aria-label="View edit history"
                  title="Edit history"
                  style={{
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
                {onErase && (
                  <button
                    type="button"
                    onClick={() => onErase(r)}
                    disabled={erasingId === r.id}
                    aria-label="Erase entry"
                    title="Erase"
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      borderRadius: 8,
                      border: "1px solid var(--border-strong)",
                      background: "var(--surface)",
                      color: "var(--critical)",
                      display: "grid",
                      placeItems: "center",
                      cursor: erasingId === r.id ? "wait" : "pointer",
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {erasingId === r.id ? "…" : "×"}
                  </button>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px 12px",
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                <strong>{r.date}</strong>
                <span style={{ fontFamily: "var(--font-mono)" }}>{r.size ?? "—"}</span>
                {/* Product type has been written onto every event since day one
                    and displayed nowhere — including here, where the audit
                    trail is meant to show what was actually recorded. */}
                {describeProductType(r.productType) && (
                  <span style={{ color: "var(--text-2)", fontSize: 12 }}>
                    {describeProductType(r.productType)}
                  </span>
                )}
                <span style={{ color: "var(--text-3)", fontSize: 12 }}>
                  {fmtStamp(r.recordedAt)}
                  {edited ? " · edited" : ""}
                </span>
                {r.source === "manual" ? (
                  <TonePill tone="accent">Data entry</TonePill>
                ) : (
                  <span style={{ color: "var(--text-2)", fontSize: 12 }} title={r.fileLabel}>
                    {truncate(r.fileLabel, 24)}
                  </span>
                )}
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
                    {r.checked > 0 ? r.checked.toLocaleString() : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase" }}>
                    Accepted
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--positive)" }}>
                    {r.accepted > 0 ? r.accepted.toLocaleString() : "—"}
                  </div>
                </div>
                {/* Held units were always on the ledger (inspection·rework) but
                    this row never read them back, so Checked never visibly
                    summed to Accepted + Hold + Rejected. */}
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
                  >
                    {r.rejected > 0 ? r.rejected.toLocaleString() : "—"}
                  </div>
                </div>
              </div>
              {r.defects.length > 0 && (
                <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                  {r.defects.map((d, di) => (
                    <span key={d.code}>
                      {di > 0 ? ", " : null}
                      <strong style={{ fontWeight: 600 }}>{d.code}</strong>
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: 12 }}>
                        {" "}
                        {d.qty}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {historyRow && (
        <EntryRevisionHistory row={historyRow} onClose={() => setHistoryRow(null)} />
      )}
    </div>
  );
}

/* ===================== Focus banner (Schema deep-link) ===================== */

function FocusIssueBanner({
  focus,
  onDismiss,
}: {
  focus: IntegrityFocus;
  onDismiss: () => void;
}) {
  const fixHref = integrityFixHref(focus as IntegrityIssue);
  const locus = [focus.batch, focus.stageId, focus.date, focus.size].filter(Boolean).join(" · ");
  const sev = focus.severity === "warning" ? "warning" : "critical";
  const sevColor = sev === "critical" ? "var(--critical)" : "var(--warning)";
  const bg =
    sev === "critical"
      ? "color-mix(in srgb, var(--critical-weak) 75%, var(--surface))"
      : "color-mix(in srgb, var(--warning-weak) 75%, var(--surface))";

  return (
    <div
      role="status"
      style={{
        marginBottom: 14,
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid color-mix(in srgb, ${sevColor} 35%, var(--border))`,
        background: bg,
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-start",
        justifyContent: "space-between",
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 999,
              background: "var(--surface)",
              color: sevColor,
              border: `1px solid color-mix(in srgb, ${sevColor} 30%, var(--border))`,
            }}
          >
            {focus.code}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: sevColor }}>
            Focused integrity issue
          </span>
          {locus ? (
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
              {locus}
            </span>
          ) : null}
        </div>
        {focus.message ? (
          <div style={{ marginTop: 6, fontSize: 13.5, color: "var(--text)", lineHeight: 1.45, fontWeight: 500 }}>
            {focus.message}
          </div>
        ) : null}
        {(focus.stated != null || focus.computed != null) && (
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {focus.stated != null && Number.isFinite(focus.stated) && (
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 8,
                  background: "var(--surface)",
                  color: "var(--text-2)",
                }}
              >
                Stated {Number(focus.stated).toLocaleString()}
              </span>
            )}
            {focus.computed != null && Number.isFinite(focus.computed) && (
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 8,
                  background: "var(--surface)",
                  color: "var(--critical)",
                }}
              >
                Computed {Number(focus.computed).toLocaleString()}
              </span>
            )}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-3)" }}>
          Matching rows are highlighted below. Dismiss to browse the full trail.
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {fixHref && (
          <a
            href={fixHref}
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "7px 12px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "var(--text-invert, #fff)",
              textDecoration: "none",
            }}
          >
            Fix in Data Entry
          </a>
        )}
        <button
          type="button"
          onClick={onDismiss}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "7px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-strong)",
            background: "var(--surface)",
            color: "var(--text-2)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ===================== Session accordion ===================== */

function SessionAccordion({
  session: s,
  open,
  onToggle,
  commentsMap,
}: {
  session: AuditSession;
  open: boolean;
  onToggle: () => void;
  commentsMap: Map<string, string[]>;
}) {
  const sourceTone: Tone =
    s.source === "manual" ? "accent" : s.source === "excel" ? "positive" : "warning";
  const sourceLabel = s.source === "manual" ? "Data entry" : s.source === "excel" ? "Excel" : "Mixed";
  const openBg =
    sourceTone === "positive"
      ? "color-mix(in srgb, var(--positive-weak) 65%, var(--surface))"
      : sourceTone === "warning"
        ? "color-mix(in srgb, var(--warning-weak) 65%, var(--surface))"
        : "color-mix(in srgb, var(--accent-weak) 65%, var(--surface))";

  return (
    <article
      className="audit-row"
      style={{
        borderTop: "1px solid var(--border)",
        background: open ? openBg : "var(--surface)",
        transition: "background 0.18s var(--ease-out)",
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onToggle();
        }}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <Chevron open={open} tone={sourceTone} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px" }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{s.fileLabel}</span>
            <TonePill tone={sourceTone}>{sourceLabel}</TonePill>
            <TonePill tone="neutral">{s.eventCount} events</TonePill>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>
            {s.dateFrom === s.dateTo ? s.dateFrom : `${s.dateFrom} – ${s.dateTo}`}
            {" · "}
            {s.stages.map(stageLabel).join(", ") || "—"}
          </div>
        </div>
      </button>
      {open && (
        <div className="audit-reveal" style={{ padding: "4px 16px 14px 52px", borderTop: "1px solid var(--border)" }}>
          <RawTable rows={s.events} commentsMap={commentsMap} />
        </div>
      )}
    </article>
  );
}

function RawTable({ rows, commentsMap }: { rows: any[]; commentsMap?: Map<string, string[]> }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            {["Date", "Batch", "Type", "Stage", "Qty", "Cell"].map((h) => (
              <th
                key={h}
                style={{
                  padding: "8px 12px",
                  textAlign: h === "Qty" ? "right" : "left",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--text-3)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((e, i) => (
            <tr key={e.eventId || i} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ ...cellMono, padding: "9px 12px" }}>{e.occurredOn?.start ?? "—"}</td>
              <td style={{ ...cellMono, padding: "9px 12px", fontWeight: 600 }}>{batchOf(e) ?? "—"}</td>
              <td style={{ padding: "9px 12px" }}>
                <TypeBadge type={e.eventType} />
              </td>
              <td style={{ padding: "9px 12px" }}>
                {e.stageId ? stageLabel(e.stageId) : "—"}
                {e.defectCodeRaw ? (
                  <span style={{ color: "var(--accent)", marginLeft: 6 }}>{e.defectCodeRaw}</span>
                ) : null}
              </td>
              <td style={{ ...cellMono, padding: "9px 12px", textAlign: "right", fontWeight: 600 }}>
                {e.quantity ?? e.statedValue ?? "—"}
              </td>
              <td style={{ ...cellMono, padding: "9px 12px", color: "var(--text-3)" }}>
                {e.provenance?.cells?.[0] || "—"}
                {commentsMap && e.eventId && (commentsMap.get(e.eventId)?.length ?? 0) > 0 && (
                  <span style={{ marginLeft: 6, color: "var(--warning)" }}>note</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===================== UI atoms ===================== */

type Tone = "neutral" | "positive" | "accent" | "warning" | "critical";

const TONE: Record<
  Tone,
  { bg: string; fg: string; border: string; soft: string }
> = {
  neutral: {
    bg: "var(--surface)",
    fg: "var(--text)",
    border: "var(--border)",
    soft: "var(--surface-2)",
  },
  positive: {
    bg: "var(--positive-weak)",
    fg: "var(--positive)",
    border: "color-mix(in srgb, var(--positive) 28%, var(--border))",
    soft: "var(--positive-weak)",
  },
  accent: {
    bg: "var(--accent-weak)",
    fg: "var(--accent)",
    border: "color-mix(in srgb, var(--accent) 30%, var(--border))",
    soft: "var(--accent-weak)",
  },
  warning: {
    bg: "var(--warning-weak)",
    fg: "var(--warning)",
    border: "color-mix(in srgb, var(--warning) 30%, var(--border))",
    soft: "var(--warning-weak)",
  },
  critical: {
    bg: "var(--critical-weak)",
    fg: "var(--critical)",
    border: "color-mix(in srgb, var(--critical) 28%, var(--border))",
    soft: "var(--critical-weak)",
  },
};

function StatPill({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        background: t.bg,
        border: `1px solid ${t.border}`,
        boxShadow: "var(--shadow-1)",
        minHeight: 72,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: tone === "neutral" ? "var(--text-3)" : t.fg,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: tone === "neutral" ? "var(--text)" : t.fg,
          lineHeight: 1.15,
        }}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {hint ? (
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, lineHeight: 1.3 }}>{hint}</div>
      ) : null}
    </div>
  );
}

function TonePill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 9px",
        borderRadius: 999,
        background: t.soft,
        color: tone === "neutral" ? "var(--text-2)" : t.fg,
        border: `1px solid ${t.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const tone: Tone =
    type === "production"
      ? "positive"
      : type === "inspection"
        ? "accent"
        : type === "rejection"
          ? "warning"
          : type === "annotation"
            ? "critical"
            : "neutral";
  const t = TONE[tone];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 999,
        background: t.bg,
        color: tone === "neutral" ? "var(--text-2)" : t.fg,
        border: `1px solid ${t.border}`,
        textTransform: "capitalize",
      }}
    >
      {type}
    </span>
  );
}

function Chevron({ open, tone = "neutral" }: { open: boolean; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <span
      aria-hidden
      className="audit-chevron"
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        background: open ? t.soft : "var(--surface-2)",
        color: open && tone !== "neutral" ? t.fg : "var(--text-2)",
        border: open ? `1px solid ${t.border}` : "1px solid transparent",
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
        transform: open ? "rotate(0deg)" : "rotate(-90deg)",
      }}
    >
      ▾
    </span>
  );
}

function SegControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 3,
        background: "var(--surface-2)",
        borderRadius: 10,
      }}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              padding: size === "sm" ? "5px 10px" : "6px 12px",
              borderRadius: 8,
              border: "none",
              fontSize: size === "sm" ? 12 : 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              background: on ? "var(--surface)" : "transparent",
              color: on ? "var(--text)" : "var(--text-3)",
              boxShadow: on ? "var(--shadow-1)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <Icon
        name="search"
        size={14}
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--text-3)",
        }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "8px 12px 8px 32px",
          borderRadius: 8,
          border: "1px solid var(--border-strong)",
          background: "var(--bg)",
          color: "var(--text)",
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: "52px 24px", textAlign: "center", fontSize: 14, color: "var(--text-3)" }}>
      {text}
    </div>
  );
}

function Pager({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (n: number | ((p: number) => number)) => void;
}) {
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  const btn = (disabled: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--surface)",
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    color: "var(--text)",
  });
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface-2)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
        {from}–{to} of {total}
      </span>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" disabled={page === 0} onClick={() => onPage((p) => p - 1)} style={btn(page === 0)}>
          Previous
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPage((p) => p + 1)}
          style={btn(page >= totalPages - 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const cellMono: React.CSSProperties = {
  padding: "10px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  color: "var(--text)",
  whiteSpace: "nowrap",
};

function AuditCustomRangePill({
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
}: {
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasRange = !!(dateFrom || dateTo);

  const label = useMemo(() => {
    if (dateFrom && dateTo) {
      const fmt = (iso: string) => {
        const d = new Date(iso + "T00:00:00");
        if (Number.isNaN(d.getTime())) return iso;
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      };
      return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
    }
    if (dateFrom) return `From ${dateFrom}`;
    if (dateTo) return `Until ${dateTo}`;
    return "Custom range";
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("click", onClickOutside);
    return () => window.removeEventListener("click", onClickOutside);
  }, [open]);

  return (
    <div ref={popoverRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 11px",
          borderRadius: 999,
          border: `1px solid ${hasRange ? "color-mix(in srgb, var(--accent) 45%, var(--border))" : "var(--border-strong)"}`,
          background: hasRange ? "var(--accent-weak)" : "var(--surface-2)",
          color: hasRange ? "var(--accent-text, var(--accent))" : "var(--text)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.15s ease",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>{label}</span>
        <span style={{ fontSize: 9, opacity: 0.7, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 350,
            width: 250,
            padding: 12,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-3)" }}>
              Custom Range
            </span>
            {hasRange && (
              <button
                type="button"
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                Reset
              </button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", width: 34 }}>From</span>
              <DatePicker
                value={dateFrom}
                onChange={(d) => setDateFrom(d)}
                ariaLabel="Audit from date"
                size="sm"
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", width: 34 }}>To</span>
              <DatePicker
                value={dateTo}
                onChange={(d) => setDateTo(d)}
                ariaLabel="Audit to date"
                size="sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              marginTop: 2,
              padding: "5px 12px",
              borderRadius: 6,
              background: "var(--accent)",
              color: "var(--text-invert, #fff)",
              fontSize: 11.5,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

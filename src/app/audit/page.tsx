"use client";

/**
 * Hallmark · product · workbench audit ledger
 * tone: operational · simple · scannable
 * Pattern: Batch accordion → stage tabs → sheet grid (one stage at a time)
 */

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useEvents } from "@/components/app/EventsContext";
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
  type AuditBatchGroup,
  type AuditDatePreset,
  type AuditEntryRow,
  type AuditSession,
  type AuditStageBucket,
} from "@/lib/analytics/audit-sessions";
import {
  integrityFixHref,
  parseIntegrityFocus,
  rowMatchesIntegrityFocus,
  type IntegrityFocus,
  type IntegrityIssue,
} from "@/lib/analytics/integrity";

type ViewMode = "batch" | "sessions" | "raw";

const STAGE_ORDER = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];

function stageLabel(id: string): string {
  const map: Record<string, string> = {
    visual: "Visual",
    "eye-punching": "Eye punching",
    balloon: "Balloon",
    "valve-integrity": "Valve integrity",
    final: "Final",
    "(unknown stage)": "Unknown",
  };
  return map[id] ?? id;
}

export default function AuditPage() {
  const { events: contextEvents, isLoading: loading } = useEvents();
  const events = (contextEvents ?? []) as any[];

  const [viewMode, setViewMode] = useState<ViewMode>("batch");
  const [datePreset, setDatePreset] = useState<AuditDatePreset>("30d");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
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
    setDatePreset("all"); // don't hide the issue behind 30d
    if (focus.stageId) setStageFilter(focus.stageId);
    // Prefer batch for search; fall back to date so the list narrows
    if (focus.batch) setSearchQuery(focus.batch);
    else if (focus.date) setSearchQuery(focus.date);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, typeFilter, stageFilter, sourceFilter, datePreset, viewMode]);

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

  const stats = useMemo(() => {
    let productions = 0,
      inspections = 0,
      accepted = 0,
      rejections = 0,
      annotations = 0;
    const files = new Set<string>();
    for (const e of events) {
      if (e.eventType === "production") productions++;
      else if (e.eventType === "inspection") {
        inspections++;
        if (e.disposition === "accepted" || e.disposition === "good") accepted++;
      }
      else if (e.eventType === "rejection") rejections++;
      else if (e.eventType === "annotation") annotations++;
      if (e.provenance?.fileHash) files.add(e.provenance.fileHash);
    }
    return { productions, inspections, accepted, rejections, annotations, files: files.size };
  }, [events]);

  const stageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.stageId) set.add(e.stageId);
    return [...set].sort((a, b) => {
      const ia = STAGE_ORDER.indexOf(a);
      const ib = STAGE_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [events]);

  const datedEvents = useMemo(
    () => filterEventsByDatePreset(events, datePreset),
    [events, datePreset]
  );

  const entryRows = useMemo(() => {
    return filterEntryRows(buildEntryRows(datedEvents, commentsMap), {
      source: sourceFilter as "all" | "manual" | "excel",
      stageId: stageFilter,
      search: searchQuery,
    });
  }, [datedEvents, commentsMap, sourceFilter, stageFilter, searchQuery]);

  const batchGroups = useMemo(() => groupByBatchThenStage(entryRows), [entryRows]);

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

        {/* —— Colored pillbox summary —— */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
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
            label="Sheet rows"
            value={String(entryRows.length)}
            hint="Checked / rejected lines"
            tone="neutral"
          />
          <StatPill
            label="Production"
            value={stats.productions}
            hint="Checked input entries"
            tone="neutral"
          />
          <StatPill
            label="Inspections"
            value={stats.inspections}
            hint="Quality / reject logs"
            tone="accent"
          />
          <StatPill
            label="Accepted"
            value={stats.accepted}
            hint="Good / passed units"
            tone="positive"
          />
          <StatPill
            label="Defect splits"
            value={stats.rejections}
            hint="Reason-specific points"
            tone="warning"
          />
          <StatPill
            label="Files"
            value={stats.files}
            hint="Source workbooks"
            tone="neutral"
          />
          <StatPill
            label="Comments"
            value={stats.annotations}
            hint="Operator notes"
            tone="accent"
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
            <SegControl
              value={datePreset}
              onChange={setDatePreset}
              options={[
                { id: "7d", label: "7d" },
                { id: "30d", label: "30d" },
                { id: "90d", label: "90d" },
                { id: "all", label: "All" },
              ]}
              size="sm"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: viewMode === "raw" ? "1.5fr 1fr 1fr 1fr" : "1.5fr 1fr 1fr",
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
            />
            <Select
              value={stageFilter}
              onChange={setStageFilter}
              options={[
                { value: "all", label: "All stages" },
                ...stageOptions.map((s) => ({ value: s, label: stageLabel(s) })),
              ]}
            />
            {viewMode === "raw" && (
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  { value: "all", label: "All types" },
                  { value: "production", label: "Production" },
                  { value: "inspection", label: "Inspection" },
                  { value: "rejection", label: "Rejection" },
                ]}
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
              {(pageSlice as AuditBatchGroup[]).map((g) => (
                <BatchAccordion
                  key={g.batch}
                  group={g}
                  open={openBatch === g.batch}
                  activeStage={stageTab[g.batch] ?? g.stages[0]?.stageId ?? ""}
                  onToggle={() => selectBatch(g.batch)}
                  onStage={(sid) => setStageTab((t) => ({ ...t, [g.batch]: sid }))}
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
  focus,
}: {
  group: AuditBatchGroup;
  open: boolean;
  activeStage: string;
  onToggle: () => void;
  onStage: (stageId: string) => void;
  focus?: IntegrityFocus | null;
}) {
  const stage: AuditStageBucket | undefined =
    g.stages.find((s) => s.stageId === activeStage) ?? g.stages[0];
  const dateLine =
    g.dateFrom === g.dateTo ? g.dateFrom : `${g.dateFrom} – ${g.dateTo}`;
  const noBatch = g.batch === "(no batch)";
  const hasReject = g.rejectedQty > 0;

  return (
    <article
      className="audit-row"
      style={{
        borderTop: "1px solid var(--border)",
        background: open
          ? hasReject
            ? "color-mix(in srgb, var(--critical-weak) 55%, var(--surface))"
            : "color-mix(in srgb, var(--accent-weak) 70%, var(--surface))"
          : "var(--surface)",
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
        <Chevron open={open} tone={hasReject ? "critical" : "accent"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: noBatch ? "var(--text-3)" : "var(--text)",
              }}
            >
              {noBatch ? "No batch" : g.batch}
            </span>
            <TonePill tone="neutral">
              {g.stages.length} stage{g.stages.length === 1 ? "" : "s"}
            </TonePill>
            <TonePill tone="positive">
              {g.rowCount} row{g.rowCount === 1 ? "" : "s"}
            </TonePill>
            {hasReject && (
              <TonePill tone="critical">{g.rejectedQty.toLocaleString()} rejected</TonePill>
            )}
          </div>
          <div style={{ marginTop: 5, fontSize: 13, color: "var(--text-2)", display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
            <span>{dateLine}</span>
            {g.checkedQty > 0 && (
              <span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)" }}>
                  {g.checkedQty.toLocaleString()}
                </span>{" "}
                checked
              </span>
            )}
            {g.acceptedQty > 0 && (
              <span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--positive)" }}>
                  {g.acceptedQty.toLocaleString()}
                </span>{" "}
                accepted
              </span>
            )}
            {hasReject && (
              <span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--critical)" }}>
                  {g.rejectedQty.toLocaleString()}
                </span>{" "}
                rejected
              </span>
            )}
          </div>
        </div>
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
  focus,
}: {
  rows: AuditEntryRow[];
  stageName: string;
  stageId?: string;
  batch?: string;
  focus?: IntegrityFocus | null;
}) {
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
        </span>
        {anyFocus && (
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 11 }}>
            {focus?.code} matched
          </span>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr>
              {["Date", "Size", "Checked", "Accepted", "Rejected", "Defects", "Source"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "9px 12px",
                    textAlign: h === "Checked" || h === "Accepted" || h === "Rejected" ? "right" : "left",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    color: "var(--text-3)",
                    background: "var(--surface-2)",
                    borderBottom: "1px solid var(--border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const hit = !!(
                focus &&
                rowMatchesIntegrityFocus({ date: r.date, size: r.size, stageId, batch }, focus)
              );
              return (
              <tr
                key={r.id}
                data-integrity-hit={hit ? "1" : undefined}
                style={{
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  background: hit
                    ? "color-mix(in srgb, var(--critical-weak) 70%, var(--surface))"
                    : i % 2
                      ? "color-mix(in srgb, var(--surface-2) 45%, transparent)"
                      : "transparent",
                  outline: hit
                    ? "2px solid color-mix(in srgb, var(--critical) 45%, transparent)"
                    : undefined,
                  outlineOffset: hit ? -2 : undefined,
                }}
              >
                <td style={cellMono}>{r.date}</td>
                <td style={cellMono}>{r.size ?? "—"}</td>
                <td style={{ ...cellMono, textAlign: "right", fontWeight: 600 }}>
                  {r.checked > 0 ? r.checked.toLocaleString() : "—"}
                </td>
                <td
                  style={{
                    ...cellMono,
                    textAlign: "right",
                    fontWeight: 600,
                    color: r.accepted > 0 ? "var(--positive)" : "var(--text)",
                  }}
                >
                  {r.accepted > 0 ? r.accepted.toLocaleString() : "—"}
                </td>
                <td
                  style={{
                    ...cellMono,
                    textAlign: "right",
                    fontWeight: 600,
                    color: r.rejected > 0 ? "var(--critical)" : "var(--text)",
                  }}
                >
                  {r.rejected > 0 ? r.rejected.toLocaleString() : "—"}
                </td>
                <td style={{ padding: "10px 12px", lineHeight: 1.45, color: "var(--text)" }}>
                  {r.defects.length === 0 ? (
                    <span style={{ color: "var(--text-3)" }}>—</span>
                  ) : (
                    r.defects.map((d, di) => (
                      <span key={d.code}>
                        {di > 0 ? ", " : null}
                        <strong style={{ fontWeight: 600 }}>{d.code}</strong>
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)", fontSize: 12 }}>
                          {" "}
                          {d.qty}
                        </span>
                      </span>
                    ))
                  )}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13 }}>
                  {r.source === "manual" ? (
                    <TonePill tone="accent">Data entry</TonePill>
                  ) : (
                    <span style={{ color: "var(--text-2)" }} title={r.fileLabel}>
                      {truncate(r.fileLabel, 24)}
                    </span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid var(--border-strong)",
        background: "var(--bg)",
        color: "var(--text)",
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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

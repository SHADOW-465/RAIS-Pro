"use client";

// Lots (plan §4): Open Lots + Hold Quantity on one screen.
// L1 = four tiles + "Show stalled lots". L2 = Open / Stalled / Hold / Complete
// tabs over one lots table (rows expand to stages done and waiting). L3 = the
// charts behind a disclosure, and the detail drawer with each lot's history.
// Both /lots/open and /lots/hold render this; the route only picks the tab, so
// role access stays on the "open-lots" and "hold" NavKeys the proxy checks.

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useLineage } from "@/components/app/LineageContext";
import { usePersona } from "@/components/app/PersonaContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { Card, LineChart, MultiLine, BarsH, Donut, ScopeBasis, seriesColor } from "@/components/app/widgets";
import FloatingDetailModal, { type SourceRow, type SourceMetricKind } from "@/components/FloatingDetailModal";
import { QualityHeader, DrillLinks } from "@/components/app/QualityParts";
import { EmptyState, GhostButton, StatusBadge } from "@/components/ui/primitives";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Tabs from "@/components/ui/Tabs";
import { toSourceRows } from "@/lib/analytics/source-trace";
import {
  buildOpenLots,
  holdReport,
  processLabel,
  resolveScope,
  lotScopeLabel,
  STAGE_LABELS,
  PROCESS_ORDER,
  useApplyInvestigationFromUrl,
  type ProcessId,
  type OpenLotRow,
  type Scope,
} from "@/lib/analytics";
import {
  buildProcessLotGrouping,
  scopeRowsForProcessLots,
  type ProcessLotGrouping,
  type LotSourceCategory,
} from "@/lib/lineage";
import type { AuditEventLike } from "@/lib/analytics/audit-sessions";
import type { HoldBatchRow } from "@/lib/analytics/hold";

export type LotsTab = "open" | "stalled" | "hold" | "complete";

const TAB_HREF: Record<LotsTab, string> = {
  open: "/lots/open",
  stalled: "/lots/open?view=stalled",
  hold: "/lots/hold",
  complete: "/lots/open?view=complete",
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const PROCESS_COLOR: Record<ProcessId, string> = {
  primary: seriesColor(0),
  secondary: seriesColor(1),
  assembly: seriesColor(2),
};

type ModalOptions = {
  initialShowSource?: boolean;
  defaultSourceTab?: "batches" | "history";
  lotGrouping?: ProcessLotGrouping;
  initialLotCategory?: "all" | LotSourceCategory;
};

export default function LotsWorkspace({ initialTab }: { initialTab: LotsTab }) {
  const { t } = useTweaks();
  useApplyInvestigationFromUrl();
  const { events: contextEvents, isLoading } = useEvents();
  const { conversions } = useLineage();
  const { allowsNav } = usePersona();
  const { policy } = useRegistry();
  const events = (contextEvents ?? []) as AuditEventLike[];

  const canOpen = allowsNav("open-lots");
  const canHold = allowsNav("hold");
  const [tab, setTab] = useState<LotsTab>(initialTab);
  // ?view=stalled|complete deep-links (bookmarks, the Home "Stalled lots" tile).
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "stalled" || v === "complete") setTab(v);
  }, []);
  const selectTab = (id: string) => {
    setTab(id as LotsTab);
    window.history.replaceState(null, "", TAB_HREF[id as LotsTab]);
  };
  const [showCharts, setShowCharts] = useState(false);

  const [modal, setModal] = useState<{
    title: string;
    insight: string | string[];
    content: React.ReactNode;
    rows?: SourceRow[];
    value?: string;
    metricKind: SourceMetricKind;
    opts: ModalOptions;
  } | null>(null);
  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string; metricKind?: SourceMetricKind },
    opts: ModalOptions = {},
  ) => setModal({ title, insight, content, rows: source?.rows, value: source?.value, metricKind: source?.metricKind ?? "generic", opts });

  const report = useMemo(
    () => buildOpenLots(events, { grain: t.grain, dateFrom: t.dateFrom, dateTo: t.dateTo }),
    [events, t.grain, t.dateFrom, t.dateTo],
  );
  const scope: Scope = useMemo(() => resolveScope((contextEvents ?? []) as never[], t, policy), [contextEvents, t, policy]);
  const hold = useMemo(
    () => (contextEvents && contextEvents.length > 0 ? holdReport(contextEvents as never[], scope) : null),
    [contextEvents, scope],
  );

  const allRows = useMemo(() => toSourceRows(events, {}), [events]);
  const rowsFor = (batches: Set<string>) => allRows.filter((r) => Boolean(r.batch && batches.has(r.batch)));
  const openLots = useMemo(() => report.lots.filter((l) => l.open), [report.lots]);
  const stalledLots = useMemo(() => report.lots.filter((l) => l.stalled), [report.lots]);
  const completeLots = useMemo(() => report.lots.filter((l) => l.lineComplete), [report.lots]);
  const completeRows = useMemo(() => rowsFor(new Set(completeLots.map((l) => l.batch))), [allRows, completeLots]); // eslint-disable-line react-hooks/exhaustive-deps

  const overallGrouping = useMemo(() => buildProcessLotGrouping(report.lots, conversions), [report.lots, conversions]);
  const startedRows = useMemo(() => scopeRowsForProcessLots(allRows, overallGrouping), [allRows, overallGrouping]);
  const processGroupings = useMemo(
    () => ({
      primary: buildProcessLotGrouping(report.lots, conversions, { process: "primary" }),
      secondary: buildProcessLotGrouping(report.lots, conversions, { process: "secondary" }),
      assembly: buildProcessLotGrouping(report.lots, conversions, { process: "assembly" }),
    }),
    [report.lots, conversions],
  );

  const grainLabel = t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  const openLot = (lot: { batch: string }, sourceTab: "batches" | "history" = "history") =>
    openModal(
      `Lot ${lot.batch}`,
      "Every ledger entry recorded against this lot, in entry order.",
      null,
      { rows: allRows.filter((r) => r.batch === lot.batch), value: lot.batch },
      { initialShowSource: true, defaultSourceTab: sourceTab },
    );

  const tabItems = [
    ...(canOpen ? [
      { id: "open", label: "Open", badge: report.openCount },
      { id: "stalled", label: "Stalled", badge: report.stalledCount },
    ] : []),
    ...(canHold ? [{ id: "hold", label: "Hold", badge: hold?.lotCount ?? 0 }] : []),
    ...(canOpen ? [{ id: "complete", label: "Complete", badge: report.lineCompleteCount }] : []),
  ];

  const lotColumns: Column<OpenLotRow>[] = [
    { id: "batch", header: "Lot", mono: true, value: (l) => l.batch, render: (l) => l.batch },
    {
      id: "status", header: "Status",
      value: (l) => (l.lineComplete ? "Complete" : l.stalled ? "Stalled" : "Open"),
      render: (l) => l.lineComplete
        ? <StatusBadge status="ok" label="Complete" />
        : l.stalled ? <StatusBadge status="warning" label="Stalled" /> : <StatusBadge status="neutral" label="Open" />,
    },
    {
      id: "waiting", header: "Waiting at",
      value: (l) => (l.waitingOn ? l.processes[l.waitingOn].nextStageLabel ?? processLabel(l.waitingOn) : ""),
      render: (l) => l.waitingOn
        ? <span>{l.processes[l.waitingOn].nextStageLabel ?? "—"} <span style={{ color: "var(--text-3)" }}>· {processLabel(l.waitingOn)}</span></span>
        : <span style={{ color: "var(--text-3)" }}>—</span>,
    },
    { id: "idle", header: "Days idle", align: "right", mono: true, value: (l) => l.daysIdle, render: (l) => (l.lineComplete ? "—" : l.daysIdle) },
    { id: "last", header: "Last entry", mono: true, value: (l) => l.lastDate ?? "", render: (l) => l.lastDate ?? "—" },
    { id: "accepted", header: "Last accepted", align: "right", mono: true, value: (l) => l.lastAccepted, render: (l) => fmt(l.lastAccepted) },
  ];

  const holdColumns: Column<HoldBatchRow>[] = [
    { id: "batch", header: "Lot", mono: true, value: (b) => b.batch, render: (b) => b.batch },
    { id: "date", header: "Date", mono: true, value: (b) => b.date ?? "", render: (b) => b.date ?? "—" },
    { id: "size", header: "Size", value: (b) => b.size ?? "", render: (b) => b.size ?? "—" },
    {
      id: "stations", header: "Held at",
      render: (b) => Object.entries(b.byStage).filter(([, q]) => q > 0).map(([s]) => STAGE_LABELS[s] ?? s).join(", ") || "—",
    },
    { id: "total", header: "On hold (pcs)", align: "right", mono: true, value: (b) => b.total, render: (b) => fmt(b.total) },
  ];

  const lotsForTab = tab === "stalled" ? stalledLots : tab === "complete" ? completeLots : openLots;

  return (
    <AppShell active={initialTab === "hold" ? "hold" : "open-lots"} ownTabs>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <p style={{ fontSize: "var(--text-md)", margin: 0, color: "var(--text-2)", maxWidth: "70ch" }}>
            Lots that have entered the line. Complete means Dipping, Secondary and Assembly are all recorded; a lot is stalled after 3 days with no entry.
          </p>
          <ScopeBasis />
        </div>

        {isLoading && <PageLoader message="Reading lot progress from the ledger…" minHeight="40vh" />}

        {!isLoading && report.startedCount === 0 && !hold?.lotCount && (
          <EmptyState
            title="No named lots yet"
            body="Lots appear here once a batch ID is saved at Dipping, Secondary or Assembly. HOLD is recorded at Visual (and any other gate that captures it) under Log."
          />
        )}

        {!isLoading && (report.startedCount > 0 || (hold?.lotCount ?? 0) > 0) && (
          <>
            <QualityHeader
              tiles={[
                ...(canOpen ? [
                  { label: "Open lots", value: report.openCount, status: "neutral" as const, hint: `${fmt(report.unitsWaiting)} accepted units mid-line` },
                  { label: "Stalled 3+ days", value: report.stalledCount, status: report.stalledCount > 0 ? "warning" as const : "ok" as const, hint: "No entry in 3 or more days" },
                ] : []),
                ...(canHold ? [{
                  label: "On hold", value: Math.round(hold?.totalHold ?? 0), digits: 0, suffix: " pcs", status: "neutral" as const,
                  hint: hold ? `${hold.lotCount} lot${hold.lotCount === 1 ? "" : "s"} · ${fmtPct(hold.holdRate)} of checked` : "No HOLD in range",
                }] : []),
                ...(canOpen ? [{ label: "Line complete", value: report.lineCompleteCount, status: "neutral" as const, hint: `of ${report.startedCount} lots started` }] : []),
              ]}
              actionLabel={canOpen && report.stalledCount > 0 && tab !== "stalled" ? "Show stalled lots" : undefined}
              onAction={() => selectTab("stalled")}
            />

            <Tabs ariaLabel="Lots" items={tabItems} active={tab} onSelect={selectTab} />

            {tab !== "hold" ? (
              <DataTable
                columns={lotColumns}
                rows={lotsForTab}
                rowKey={(l) => l.batch}
                exportName={`lots-${tab}`}
                empty={tab === "stalled" ? "No stalled lots. Every open lot had an entry in the last 3 days." : tab === "complete" ? "No lot has cleared all three processes yet." : "No open lots."}
                onRowClick={(l) => openLot(l, "batches")}
                expand={(l) => <LotProgress lot={l} onHistory={() => openLot(l, "history")} />}
              />
            ) : hold && hold.batches.length > 0 ? (
              <DataTable
                columns={holdColumns}
                rows={hold.batches}
                rowKey={(b) => `${b.batch}|${b.date ?? ""}|${b.size ?? ""}`}
                exportName="lots-on-hold"
                onRowClick={(b) => openLot(b, "history")}
              />
            ) : (
              <EmptyState title="Nothing on hold" body={`No HOLD recorded for ${lotScopeLabel(t, STAGE_LABELS)}.`} />
            )}

            <div>
              <GhostButton onClick={() => setShowCharts((v) => !v)}>{showCharts ? "Hide" : "Show"} charts</GhostButton>
            </div>

            {showCharts && tab === "hold" && hold && <HoldCharts report={hold} grainLabel={grainLabel} />}

            {showCharts && tab !== "hold" && (
              <OpenLotsCharts
                report={report}
                grainLabel={grainLabel}
                allRows={allRows}
                startedRows={startedRows}
                completeRows={completeRows}
                overallGrouping={overallGrouping}
                processGroupings={processGroupings}
                openModal={openModal}
              />
            )}
          </>
        )}
      </div>

      <FloatingDetailModal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        title={modal?.title ?? ""}
        insight={modal?.insight ?? []}
        sourceRows={modal?.rows}
        primaryValue={modal?.value}
        metricKind={modal?.metricKind}
        initialShowSource={modal?.opts.initialShowSource ?? true}
        defaultSourceTab={modal?.opts.defaultSourceTab ?? "batches"}
        lotGrouping={modal?.opts.lotGrouping}
        initialLotCategory={modal?.opts.initialLotCategory ?? "all"}
        key={modal ? `${modal.title}|${modal.opts.defaultSourceTab}|${modal.opts.initialLotCategory}` : "closed"}
      >
        {modal?.content}
      </FloatingDetailModal>
    </AppShell>
  );
}

/** Expanded lot row: each process with stages done and the next one waiting. */
function LotProgress({ lot, onHistory }: { lot: OpenLotRow; onHistory: () => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
      {PROCESS_ORDER.map((p) => {
        const c = lot.processes[p];
        return (
          <div key={p} style={{ minWidth: 180 }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>{processLabel(p)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", color: "var(--text-2)" }}>
              <span style={{ fontFamily: "var(--font-mono)" }}>{c.done}/{c.total}</span>
              {c.complete
                ? <StatusBadge status="ok" label="Done" />
                : <span>next: {c.nextStageLabel ?? "—"}</span>}
            </div>
          </div>
        );
      })}
      <div style={{ marginLeft: "auto" }}>
        <GhostButton onClick={onHistory}>Entry history</GhostButton>
      </div>
    </div>
  );
}

function OpenLotsCharts({
  report, grainLabel, allRows, startedRows, completeRows, overallGrouping, processGroupings, openModal,
}: {
  report: ReturnType<typeof buildOpenLots>;
  grainLabel: string;
  allRows: SourceRow[];
  startedRows: SourceRow[];
  completeRows: SourceRow[];
  overallGrouping: ProcessLotGrouping;
  processGroupings: Record<ProcessId, ProcessLotGrouping>;
  openModal: (title: string, insight: string | string[], content: React.ReactNode, source?: { rows: SourceRow[]; value: string }, opts?: ModalOptions) => void;
}) {
  const mixDonut = [
    { label: "Line complete", value: report.lineCompleteCount, color: "var(--positive)" },
    ...PROCESS_ORDER.map((p) => ({
      label: `Waiting on ${processLabel(p)}`,
      value: report.lots.filter((l) => l.open && l.waitingOn === p).length,
      color: PROCESS_COLOR[p],
    })),
  ].filter((d) => d.value > 0);

  const processSplit = (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {report.processMix.map((p) => (
        <ProcessSplit key={p.process} label={p.label} complete={p.complete} incomplete={p.incomplete} color={PROCESS_COLOR[p.process]} />
      ))}
    </div>
  );

  // One card = one chart + Batches / History shortcuts into the drawer.
  const drill = (title: string, insight: string, content: React.ReactNode, rows: SourceRow[], value: string, grouping?: ProcessLotGrouping) => ({
    onClick: () => openModal(title, insight, content, { rows, value }, { defaultSourceTab: "batches", lotGrouping: grouping }),
    extra: (
      <DrillLinks
        name={title}
        onBatches={() => openModal(title, insight, content, { rows, value }, { defaultSourceTab: "batches", lotGrouping: grouping })}
        onHistory={() => openModal(title, insight, content, { rows, value }, { defaultSourceTab: "history", lotGrouping: grouping })}
      />
    ),
  });

  const completedChart = <LineChart points={report.completedTrend} fmt={fmt} />;
  const mixChart = <Donut data={mixDonut} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {report.completedTrend.length > 0 && (
        <Card
          title={`Cumulative completed lots (${grainLabel})`}
          sub="Lots that have cleared all three processes"
          {...drill(`Cumulative completed lots (${grainLabel})`, "Cumulative count of lots that have cleared all three processes.", completedChart, completeRows, `${report.lineCompleteCount} completed lots`)}
        >
          {completedChart}
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 20 }}>
        <Card
          title="Complete vs waiting"
          sub="Waiting lots use their process colour"
          {...drill("Complete vs waiting", "Lots that have finished the line vs lots waiting at each process.", mixChart, startedRows, `${report.lineCompleteCount} / ${report.startedCount} complete`, overallGrouping)}
        >
          {mixChart}
        </Card>
        <Card
          title="Process complete / not complete"
          sub="Among lots that have started the line"
          {...drill("Process complete / not complete", "Clearance comparison across Dipping, Secondary and Assembly.", processSplit, startedRows, `${report.startedCount} lots started`, overallGrouping)}
        >
          {processSplit}
        </Card>
      </div>

      <h2 style={{ margin: "8px 0 0", fontSize: "var(--text-lg)", fontWeight: 600 }}>By process</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {report.processMix.map((p) => {
          const grouping = processGroupings[p.process];
          const scoped = scopeRowsForProcessLots(allRows, grouping, p.process);
          const rows = scoped.length > 0 ? scoped : startedRows;
          const donut = (
            <Donut
              data={[
                { label: "Completed", value: grouping.completedCount, color: PROCESS_COLOR[p.process] },
                { label: "Not completed", value: grouping.notCompletedCount, color: "color-mix(in srgb, var(--text-3) 35%, transparent)" },
                { label: "Converted batch", value: grouping.convertedCount, color: "var(--accent)" },
              ].filter((d) => d.value > 0)}
            />
          );
          const open = (tab: "batches" | "history", cat: "all" | LotSourceCategory) =>
            openModal(
              `${p.label} — process source`,
              `${grouping.completedCount} completed · ${grouping.notCompletedCount} not completed · ${grouping.convertedCount} converted batch.`,
              donut,
              { rows, value: `${grouping.completedCount} / ${grouping.totalCount} complete` },
              { defaultSourceTab: tab, lotGrouping: grouping, initialLotCategory: cat },
            );
          return (
            <Card
              key={p.process}
              title={p.label}
              extra={<DrillLinks name={p.label} onBatches={() => open("batches", "all")} onHistory={() => open("history", "all")} />}
              onClick={() => open("batches", "all")}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }} onClick={(e) => e.stopPropagation()}>
                {([
                  { key: "completed" as const, label: "Completed", count: grouping.completedCount },
                  { key: "not_completed" as const, label: "Not completed", count: grouping.notCompletedCount },
                  { key: "converted" as const, label: "Converted", count: grouping.convertedCount },
                ]).map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => open("batches", b.key)}
                    aria-label={`Open ${p.label} lots: ${b.label}`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 8, minHeight: 28, padding: "0 8px",
                      borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)",
                      color: "var(--text-2)", fontFamily: "inherit", fontSize: "var(--text-sm)", cursor: "pointer",
                    }}
                  >
                    {b.label}
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)" }}>{b.count}</span>
                  </button>
                ))}
              </div>
              {donut}
            </Card>
          );
        })}
      </div>

      <h2 style={{ margin: "8px 0 0", fontSize: "var(--text-lg)", fontWeight: 600 }}>Stage split — complete vs not complete</h2>
      {PROCESS_ORDER.map((pid) => {
        const stages = report.stageClearance.filter((s) => s.process === pid);
        if (stages.length === 0) return null;
        const grouping = processGroupings[pid];
        const scoped = scopeRowsForProcessLots(allRows, grouping, pid);
        const rows = scoped.length > 0 ? scoped : startedRows;
        const el = (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {stages.map((s, i) => (
              <ProcessSplit
                key={s.stageId}
                label={s.label}
                complete={s.lotsDone}
                incomplete={Math.max(0, s.lotsTotal - s.lotsDone)}
                color={seriesColor(3 + PROCESS_ORDER.indexOf(pid) * 4 + i)}
                accent={PROCESS_COLOR[pid]}
              />
            ))}
          </div>
        );
        return (
          <Card
            key={pid}
            title={processLabel(pid)}
            sub="Lots that have this station vs lots that have not"
            {...drill(`${processLabel(pid)} — stage split`, `Station clearance across lots for ${processLabel(pid)}.`, el, rows, `${grouping.completedCount} / ${grouping.totalCount} complete`, grouping)}
          >
            {el}
          </Card>
        );
      })}
    </div>
  );
}

function HoldCharts({ report, grainLabel }: { report: NonNullable<ReturnType<typeof holdReport>>; grainLabel: string }) {
  const chartStages = report.stages.filter((s) => s.hold > 0);
  const colorByStageId: Record<string, string> = {};
  chartStages.forEach((s, i) => { colorByStageId[s.stageId] = seriesColor(i); });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 20 }}>
        <Card title="HOLD by station" sub="Share of held pieces">
          <BarsH rows={chartStages.map((s) => ({ label: s.label, value: s.hold, sub: `${fmt(s.hold)} · ${fmtPct(s.holdRate)}` }))} fmt={fmt} />
        </Card>
        <Card title="HOLD share">
          <Donut data={chartStages.map((s) => ({ label: s.label, value: s.hold, color: colorByStageId[s.stageId] }))} />
        </Card>
      </div>
      {report.trend.length > 0 && (
        <Card title={`HOLD trend (${grainLabel})`} sub="Pieces held, not a rate">
          <LineChart points={report.trend} fmt={fmt} />
        </Card>
      )}
      {report.stageTrend.length > 0 && chartStages.length > 0 && (
        <Card title={`HOLD by stage (${grainLabel})`} sub="Each colour is one station in process order">
          <MultiLine data={report.stageTrend} stages={chartStages} fmt={fmt} colorByStageId={colorByStageId} />
        </Card>
      )}
    </div>
  );
}

function ProcessSplit({ label, complete, incomplete, color, accent }: { label: string; complete: number; incomplete: number; color: string; accent?: string }) {
  const total = complete + incomplete;
  const pct = total > 0 ? (complete / total) * 100 : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4, fontSize: "var(--text-sm)" }}>
        <span style={{ fontWeight: 500, color: "var(--text)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{complete} complete · {incomplete} not</span>
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: "var(--radius-pill)", overflow: "hidden", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <span style={{ width: `${pct}%`, background: accent ?? color, minWidth: complete > 0 ? 4 : 0 }} />
        <span style={{ flex: 1, background: `color-mix(in srgb, ${color} 22%, var(--surface-2))` }} />
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, type CSSProperties } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useLineage } from "@/components/app/LineageContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { Card, Kpi, LineChart, Donut, seriesColor } from "@/components/app/widgets";
import FloatingDetailModal, { type SourceRow, type SourceMetricKind } from "@/components/FloatingDetailModal";
import { toSourceRows } from "@/lib/analytics/source-trace";
import {
  buildOpenLots,
  processLabel,
  PROCESS_ORDER,
  type ProcessId,
  type OpenLotRow,
} from "@/lib/analytics";
import {
  buildProcessLotGrouping,
  scopeRowsForProcessLots,
  type ProcessLotGrouping,
  type LotSourceCategory,
} from "@/lib/lineage";
import type { AuditEventLike } from "@/lib/analytics/audit-sessions";

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");

const PROCESS_COLOR: Record<ProcessId, string> = {
  primary: seriesColor(0),
  secondary: seriesColor(1),
  assembly: seriesColor(2),
};

export default function OpenLotsPage() {
  const { t } = useTweaks();
  const { events: contextEvents, isLoading } = useEvents();
  const { conversions } = useLineage();
  const events = (contextEvents ?? []) as AuditEventLike[];
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalInsight, setModalInsight] = useState<string | string[]>([]);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalSourceRows, setModalSourceRows] = useState<SourceRow[] | undefined>(undefined);
  const [modalPrimaryValue, setModalPrimaryValue] = useState<string | undefined>(undefined);
  const [modalMetricKind, setModalMetricKind] = useState<SourceMetricKind>("generic");
  const [modalInitialShowSource, setModalInitialShowSource] = useState(true);
  const [modalDefaultSourceTab, setModalDefaultSourceTab] = useState<"batches" | "history">("batches");
  const [modalLotGrouping, setModalLotGrouping] = useState<ProcessLotGrouping | undefined>(undefined);
  const [modalInitialLotCategory, setModalInitialLotCategory] = useState<"all" | LotSourceCategory>("all");

  const srcRows = (filter: Parameters<typeof toSourceRows>[1] = {}): SourceRow[] =>
    toSourceRows(events, filter);

  const openModal = (
    title: string,
    insight: string | string[],
    content: React.ReactNode,
    source?: { rows: SourceRow[]; value: string; metricKind?: SourceMetricKind },
    options?: {
      initialShowSource?: boolean;
      defaultSourceTab?: "batches" | "history";
      lotGrouping?: ProcessLotGrouping;
      initialLotCategory?: "all" | LotSourceCategory;
    }
  ) => {
    setModalTitle(title);
    setModalInsight(insight);
    setModalContent(content);
    setModalSourceRows(source?.rows);
    setModalPrimaryValue(source?.value);
    setModalMetricKind(source?.metricKind ?? "generic");
    setModalInitialShowSource(options?.initialShowSource ?? true);
    setModalDefaultSourceTab(options?.defaultSourceTab ?? "batches");
    setModalLotGrouping(options?.lotGrouping);
    setModalInitialLotCategory(options?.initialLotCategory ?? "all");
    setModalOpen(true);
  };

  const report = useMemo(
    () =>
      buildOpenLots(events, {
        grain: t.grain,
        dateFrom: t.dateFrom,
        dateTo: t.dateTo,
      }),
    [events, t.grain, t.dateFrom, t.dateTo],
  );

  const openLotsBatches = useMemo(() => new Set(report.lots.filter((l) => l.open).map((l) => l.batch)), [report.lots]);
  const stalledBatches = useMemo(() => new Set(report.lots.filter((l) => l.stalled).map((l) => l.batch)), [report.lots]);
  const completeBatches = useMemo(() => new Set(report.lots.filter((l) => l.lineComplete).map((l) => l.batch)), [report.lots]);

  const allRows = useMemo(() => srcRows(), [events]);
  const openRows = useMemo(() => allRows.filter((r) => Boolean(r.batch && openLotsBatches.has(r.batch))), [allRows, openLotsBatches]);
  const stalledRows = useMemo(() => allRows.filter((r) => Boolean(r.batch && stalledBatches.has(r.batch))), [allRows, stalledBatches]);
  const completeRows = useMemo(() => allRows.filter((r) => Boolean(r.batch && completeBatches.has(r.batch))), [allRows, completeBatches]);

  const overallGrouping = useMemo(
    () => buildProcessLotGrouping(report.lots, conversions),
    [report.lots, conversions]
  );

  const startedRows = useMemo(
    () => scopeRowsForProcessLots(allRows, overallGrouping),
    [allRows, overallGrouping]
  );

  const processGroupings = useMemo(
    () => ({
      primary: buildProcessLotGrouping(report.lots, conversions, { process: "primary" }),
      secondary: buildProcessLotGrouping(report.lots, conversions, { process: "secondary" }),
      assembly: buildProcessLotGrouping(report.lots, conversions, { process: "assembly" }),
    }),
    [report.lots, conversions]
  );

  const renderCardChips = (
    onBatches: (e: React.MouseEvent) => void,
    onHistory: (e: React.MouseEvent) => void
  ) => (
    <div
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onBatches}
        title="View only Batch IDs (Option 1)"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "2px 8px",
          fontSize: 10.5,
          fontWeight: 600,
          fontFamily: "var(--font-mono)",
          color: "var(--text-2)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--accent)";
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.color = "var(--text-2)";
        }}
      >
        <span>🏷️</span>
        <span>Batches</span>
      </button>
      <button
        type="button"
        onClick={onHistory}
        title="View Data Entry History (Option 2)"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "2px 8px",
          fontSize: 10.5,
          fontWeight: 600,
          fontFamily: "var(--font-mono)",
          color: "var(--text-2)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--accent)";
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
          e.currentTarget.style.color = "var(--text-2)";
        }}
      >
        <span>📋</span>
        <span>History</span>
      </button>
    </div>
  );

  const mixDonut = [
    { label: "Line complete", value: report.lineCompleteCount, color: "var(--positive)" },
    ...PROCESS_ORDER.map((p) => ({
      label: `Waiting on ${processLabel(p)}`,
      value: report.lots.filter((l) => l.open && l.waitingOn === p).length,
      color: PROCESS_COLOR[p],
    })),
  ].filter((d) => d.value > 0);

  const grainLabel =
    t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  return (
    <AppShell active="open-lots">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 600,
              margin: "0 0 4px",
              color: "var(--text)",
            }}
          >
            Open Lots
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            Lots that have entered the line. Complete means Dipping, Secondary, and Assembly are all recorded.
            Incomplete lots are coloured by the process they are waiting on.
          </p>
        </div>

        {isLoading && <PageLoader message="Reading lot progress from the ledger…" minHeight="40vh" />}

        {!isLoading && report.startedCount === 0 && (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
              No named lots yet
            </div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Lots appear here once a batch ID is saved at Dipping, Secondary, or Assembly.
            </p>
          </div>
        )}

        {report.startedCount > 0 && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 12,
              }}
            >
              <Kpi
                label="Lots open"
                basis="Dipping, Secondary, and Assembly – all dates"
                value={String(report.openCount)}
                detail="Started, not all 3 processes"
                primary
                onClick={() =>
                  openModal(
                    "Lots Open Trace",
                    "Lots currently moving through the line that haven't cleared all 3 processes.",
                    null,
                    { rows: openRows, value: `${report.openCount} open lots` },
                    { initialShowSource: true, defaultSourceTab: "batches" }
                  )
                }
              />
              <Kpi
                label="Stalled"
                basis="Dipping, Secondary, and Assembly – all dates"
                value={String(report.stalledCount)}
                detail="No gate in 3+ days"
                tone={report.stalledCount > 0 ? "warn" : "good"}
                onClick={() =>
                  openModal(
                    "Stalled Lots Trace",
                    "Lots with no ledger activity recorded in the last 3 days.",
                    null,
                    { rows: stalledRows, value: `${report.stalledCount} stalled lots` },
                    { initialShowSource: true, defaultSourceTab: "batches" }
                  )
                }
              />
              <Kpi
                label="Line complete"
                basis="Dipping, Secondary, and Assembly – all dates"
                value={String(report.lineCompleteCount)}
                detail="Dipping + Secondary + Assembly"
                onClick={() =>
                  openModal(
                    "Line Complete Lots Trace",
                    "Lots that have recorded gates at Production Dipping, Secondary, and Assembly.",
                    null,
                    { rows: completeRows, value: `${report.lineCompleteCount} line complete lots` },
                    { initialShowSource: true, defaultSourceTab: "batches" }
                  )
                }
              />
              <Kpi
                label="Units waiting"
                basis="Dipping, Secondary, and Assembly – all dates"
                value={fmt(report.unitsWaiting)}
                detail="Accepted qty sitting mid-line"
                onClick={() =>
                  openModal(
                    "Units Waiting Mid-Line",
                    "Accepted units waiting at intermediate stations.",
                    null,
                    { rows: openRows, value: `${fmt(report.unitsWaiting)} units waiting` },
                    { initialShowSource: true, defaultSourceTab: "history" }
                  )
                }
              />
            </div>

            {report.completedTrend.length > 0 && (
              <Card
                title={`Cumulative completed lots (${grainLabel})`}
                sub="Lots that have cleared all three processes"
                extra={renderCardChips(
                  (e) =>
                    openModal(
                      `Cumulative Completed Lots (${grainLabel})`,
                      "Cumulative count of lots that have cleared all three processes.",
                      <LineChart points={report.completedTrend} fmt={fmt} />,
                      { rows: completeRows, value: `${report.lineCompleteCount} completed lots` },
                      { initialShowSource: true, defaultSourceTab: "batches" }
                    ),
                  (e) =>
                    openModal(
                      `Cumulative Completed Lots (${grainLabel})`,
                      "Cumulative count of lots that have cleared all three processes.",
                      <LineChart points={report.completedTrend} fmt={fmt} />,
                      { rows: completeRows, value: `${report.lineCompleteCount} completed lots` },
                      { initialShowSource: true, defaultSourceTab: "history" }
                    )
                )}
                onClick={() =>
                  openModal(
                    `Cumulative Completed Lots (${grainLabel})`,
                    "Cumulative count of lots that have cleared all three processes.",
                    <LineChart points={report.completedTrend} fmt={fmt} />,
                    { rows: completeRows, value: `${report.lineCompleteCount} completed lots` },
                    { initialShowSource: true, defaultSourceTab: "batches" }
                  )
                }
              >
                <LineChart points={report.completedTrend} fmt={fmt} />
              </Card>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.4fr)",
                gap: 20,
              }}
            >
              <Card
                title="Complete vs waiting"
                sub="Waiting lots use their process colour"
                extra={renderCardChips(
                  () =>
                    openModal(
                      "Complete vs waiting — Lot Breakdown",
                      "Lots that have finished the line vs lots waiting at each stage.",
                      <Donut data={mixDonut} />,
                      { rows: startedRows, value: `${report.lineCompleteCount} / ${report.startedCount} complete` },
                      { initialShowSource: true, defaultSourceTab: "batches", lotGrouping: overallGrouping }
                    ),
                  () =>
                    openModal(
                      "Complete vs waiting — Lot Breakdown",
                      "Lots that have finished the line vs lots waiting at each stage.",
                      <Donut data={mixDonut} />,
                      { rows: startedRows, value: `${report.lineCompleteCount} / ${report.startedCount} complete` },
                      { initialShowSource: true, defaultSourceTab: "history", lotGrouping: overallGrouping }
                    )
                )}
                onClick={() =>
                  openModal(
                    "Complete vs waiting — Lot Breakdown",
                    "Lots that have finished the line vs lots waiting at each stage.",
                    <Donut data={mixDonut} />,
                    { rows: startedRows, value: `${report.lineCompleteCount} / ${report.startedCount} complete` },
                    { initialShowSource: true, defaultSourceTab: "batches", lotGrouping: overallGrouping }
                  )
                }
              >
                <Donut data={mixDonut} />
              </Card>
              <Card
                title="Process complete / not complete"
                sub="Among lots that have started the line"
                extra={renderCardChips(
                  () =>
                    openModal(
                      "Process complete / not complete",
                      "Clearance comparison across Dipping, Secondary, and Assembly.",
                      (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {report.processMix.map((p) => (
                            <ProcessSplit
                              key={p.process}
                              label={p.label}
                              complete={p.complete}
                              incomplete={p.incomplete}
                              color={PROCESS_COLOR[p.process]}
                            />
                          ))}
                        </div>
                      ),
                      { rows: startedRows, value: `${report.startedCount} lots started` },
                      { initialShowSource: true, defaultSourceTab: "batches", lotGrouping: overallGrouping }
                    ),
                  () =>
                    openModal(
                      "Process complete / not complete",
                      "Clearance comparison across Dipping, Secondary, and Assembly.",
                      (
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {report.processMix.map((p) => (
                            <ProcessSplit
                              key={p.process}
                              label={p.label}
                              complete={p.complete}
                              incomplete={p.incomplete}
                              color={PROCESS_COLOR[p.process]}
                            />
                          ))}
                        </div>
                      ),
                      { rows: startedRows, value: `${report.startedCount} lots started` },
                      { initialShowSource: true, defaultSourceTab: "history", lotGrouping: overallGrouping }
                    )
                )}
                onClick={() =>
                  openModal(
                    "Process complete / not complete",
                    "Clearance comparison across Dipping, Secondary, and Assembly.",
                    (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {report.processMix.map((p) => (
                          <ProcessSplit
                            key={p.process}
                            label={p.label}
                            complete={p.complete}
                            incomplete={p.incomplete}
                            color={PROCESS_COLOR[p.process]}
                          />
                        ))}
                      </div>
                    ),
                    { rows: startedRows, value: `${report.startedCount} lots started` },
                    { initialShowSource: true, defaultSourceTab: "batches", lotGrouping: overallGrouping }
                  )
                }
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {report.processMix.map((p) => (
                    <ProcessSplit
                      key={p.process}
                      label={p.label}
                      complete={p.complete}
                      incomplete={p.incomplete}
                      color={PROCESS_COLOR[p.process]}
                    />
                  ))}
                </div>
              </Card>
            </div>

            <h2 className="h3" style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 600 }}>
              Process-wise analysis
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 16,
              }}
            >
              {report.processMix.map((p) => {
                const grouping = processGroupings[p.process];
                const scopedRows = scopeRowsForProcessLots(allRows, grouping, p.process);
                const rowsToUse = scopedRows.length > 0 ? scopedRows : startedRows;
                const donutEl = (
                  <Donut
                    data={[
                      {
                        label: "Completed",
                        value: grouping.completedCount,
                        color: PROCESS_COLOR[p.process],
                      },
                      {
                        label: "Not completed",
                        value: grouping.notCompletedCount,
                        color: "color-mix(in srgb, var(--text-3) 35%, transparent)",
                      },
                      {
                        label: "Converted batch",
                        value: grouping.convertedCount,
                        color: "var(--accent)",
                      },
                    ].filter((d) => d.value > 0)}
                  />
                );
                const openProcessSource = (
                  defaultSourceTab: "batches" | "history" = "batches",
                  initialLotCategory: "all" | LotSourceCategory = "all"
                ) =>
                  openModal(
                    `${p.label} — Process Source`,
                    `${grouping.completedCount} completed · ${grouping.notCompletedCount} not completed · ${grouping.convertedCount} converted batch.`,
                    donutEl,
                    {
                      rows: rowsToUse,
                      value: `${grouping.completedCount} / ${grouping.totalCount} complete`,
                    },
                    {
                      initialShowSource: true,
                      defaultSourceTab,
                      lotGrouping: grouping,
                      initialLotCategory,
                    }
                  );

                return (
                  <Card
                    key={p.process}
                    title={p.label}
                    extra={renderCardChips(
                      () => openProcessSource("batches", "all"),
                      () => openProcessSource("history", "all")
                    )}
                    onClick={() => openProcessSource("batches", "all")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 2,
                          background: PROCESS_COLOR[p.process],
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                        {grouping.completedCount} complete · {grouping.notCompletedCount} not complete
                        {grouping.convertedCount > 0 ? ` · ${grouping.convertedCount} converted` : ""}
                      </span>
                    </div>

                    {/* Dedicated source category buttons on the process card */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginBottom: 12,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(
                        [
                          {
                            key: "completed" as const,
                            label: "Completed",
                            count: grouping.completedCount,
                            color: "var(--positive)",
                          },
                          {
                            key: "not_completed" as const,
                            label: "Not completed",
                            count: grouping.notCompletedCount,
                            color: "var(--warning)",
                          },
                          {
                            key: "converted" as const,
                            label: "Converted batch",
                            count: grouping.convertedCount,
                            color: "var(--accent)",
                          },
                        ] as const
                      ).map((btn) => (
                        <button
                          key={btn.key}
                          type="button"
                          onClick={() => openProcessSource("batches", btn.key)}
                          title={`Open ${p.label} source grouped by ${btn.label}`}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            border: `1px solid color-mix(in srgb, ${btn.color} 40%, var(--border))`,
                            background: `color-mix(in srgb, ${btn.color} 10%, var(--surface-2))`,
                            color: "var(--text)",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 99,
                              background: btn.color,
                              flexShrink: 0,
                            }}
                          />
                          <span>{btn.label}</span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 600,
                              color: btn.color,
                            }}
                          >
                            {btn.count}
                          </span>
                        </button>
                      ))}
                    </div>

                    {donutEl}
                  </Card>
                );
              })}
            </div>

            <h2 className="h3" style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 600 }}>
              Stage split — complete vs not complete
            </h2>
            {PROCESS_ORDER.map((pid) => {
              const stages = report.stageClearance.filter((s) => s.process === pid);
              if (stages.length === 0) return null;
              const grouping = processGroupings[pid];
              const scopedRows = scopeRowsForProcessLots(allRows, grouping, pid);
              const rowsToUse = scopedRows.length > 0 ? scopedRows : startedRows;
              const stagesEl = (
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
                  extra={renderCardChips(
                    () =>
                      openModal(
                        `${processLabel(pid)} — Stage Split Source`,
                        `Station clearance across lots for ${processLabel(pid)}.`,
                        stagesEl,
                        { rows: rowsToUse, value: `${grouping.completedCount} / ${grouping.totalCount} complete` },
                        { initialShowSource: true, defaultSourceTab: "batches", lotGrouping: grouping }
                      ),
                    () =>
                      openModal(
                        `${processLabel(pid)} — Stage Split Source`,
                        `Station clearance across lots for ${processLabel(pid)}.`,
                        stagesEl,
                        { rows: rowsToUse, value: `${grouping.completedCount} / ${grouping.totalCount} complete` },
                        { initialShowSource: true, defaultSourceTab: "history", lotGrouping: grouping }
                      )
                  )}
                  onClick={() =>
                    openModal(
                      `${processLabel(pid)} — Stage Split Source`,
                      `Station clearance across lots for ${processLabel(pid)}.`,
                      stagesEl,
                      { rows: rowsToUse, value: `${grouping.completedCount} / ${grouping.totalCount} complete` },
                      { initialShowSource: true, defaultSourceTab: "batches", lotGrouping: grouping }
                    )
                  }
                >
                  {stagesEl}
                </Card>
              );
            })}

          </>
        )}
      </div>

      <FloatingDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        insight={modalInsight}
        sourceRows={modalSourceRows}
        primaryValue={modalPrimaryValue}
        metricKind={modalMetricKind}
        initialShowSource={modalInitialShowSource}
        defaultSourceTab={modalDefaultSourceTab}
        lotGrouping={modalLotGrouping}
        initialLotCategory={modalInitialLotCategory}
      >
        {modalContent}
      </FloatingDetailModal>
    </AppShell>
  );
}

function ProcessSplit({
  label,
  complete,
  incomplete,
  color,
  accent,
}: {
  label: string;
  complete: number;
  incomplete: number;
  color: string;
  accent?: string;
}) {
  const total = complete + incomplete;
  const pct = total > 0 ? (complete / total) * 100 : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4, fontSize: 12.5 }}>
        <span style={{ fontWeight: 600, color: "var(--text)" }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
          {complete} complete · {incomplete} not
        </span>
      </div>
      <div
        style={{
          display: "flex",
          height: 10,
          borderRadius: 999,
          overflow: "hidden",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <span style={{ width: `${pct}%`, background: accent ?? color, minWidth: complete > 0 ? 4 : 0 }} />
        <span
          style={{
            flex: 1,
            background: `color-mix(in srgb, ${color} 22%, var(--surface-2))`,
          }}
        />
      </div>
    </div>
  );
}

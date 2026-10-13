"use client";

import { useMemo, useState, type CSSProperties } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useRegistry } from "@/components/app/RegistryContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import {
  Card,
  Kpi,
  ScopeBasis,
  LineChart,
  MultiLine,
  BarsH,
  Donut,
  seriesColor,
} from "@/components/app/widgets";
import {
  holdReport,
  periodsIn,
  periodLabel,
  resolveScope,
  type Scope,
  STAGE_LABELS,
  useApplyInvestigationFromUrl,
  lotScopeLabel,
} from "@/lib/analytics";

const fmtPcs = (n: number) => Math.round(n).toLocaleString("en-IN");
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function HoldQuantityPage() {
  const { t } = useTweaks();
  useApplyInvestigationFromUrl();
  const { events: contextEvents, isLoading } = useEvents();
  const { policy } = useRegistry();
  const events = contextEvents ? (contextEvents as any[]) : null;
  const [lotQuery, setLotQuery] = useState("");

  const scope: Scope = useMemo(
    () => resolveScope(events ?? [], t, policy),
    [events, t, policy],
  );

  const report = useMemo(() => {
    if (!events || events.length === 0) return null;
    return holdReport(events, scope);
  }, [events, scope]);

  const latestPeriodLabel = useMemo(() => {
    if (!events || events.length === 0) return "";
    const periods = periodsIn(events, t.grain);
    const last = periods[periods.length - 1];
    return last ? periodLabel(last) : "";
  }, [events, t.grain]);

  const grainLabel =
    t.grain === "day" ? "Daily" : t.grain === "week" ? "Weekly" : t.grain === "month" ? "Monthly" : "Yearly";

  const chartStages = report?.stages.filter((s) => s.hold > 0) ?? [];
  const colorByStageId: Record<string, string> = {};
  chartStages.forEach((s, i) => {
    colorByStageId[s.stageId] = seriesColor(i);
  });

  const q = lotQuery.trim().toUpperCase();
  const batchRows = (report?.batches ?? []).filter(
    (b) => !q || b.batch.includes(q),
  );
  const matrixStages = chartStages.length > 0 ? chartStages : report?.stages ?? [];

  return (
    <AppShell active="hold" dateRange={latestPeriodLabel}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 800,
              margin: "0 0 4px",
              color: "var(--text)",
            }}
          >
            Hold Quantity
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            HOLD by lot and station, plus hold trend over the selected interval
            {t.stageView !== "cumulative"
              ? ` · focused on ${STAGE_LABELS[t.stageView] ?? t.stageView}`
              : ""}
            {t.dateFrom && t.dateTo ? ` · ${t.dateFrom} → ${t.dateTo}` : ""}.
          </p>
          <ScopeBasis />
        </div>

        {isLoading && <PageLoader message="Reading HOLD events from the ledger…" minHeight="40vh" />}

        {!isLoading && (!events || events.length === 0) && (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontWeight: 800,
                marginBottom: 8,
                color: "var(--text)",
              }}
            >
              No Data Available
            </div>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 16px" }}>
              HOLD is recorded at Visual (and any other gate that captures it) on Data Entry.
            </p>
            <a
              href="/data-entry"
              style={{
                display: "inline-block",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 12.5,
                color: "var(--paper)",
                background: "var(--accent)",
                padding: "8px 16px",
                borderRadius: "var(--radius-md)",
              }}
            >
              Go to Data Entry →
            </a>
          </div>
        )}

        {report && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <Kpi
                label="Total HOLD"
                basis={lotScopeLabel(t, STAGE_LABELS)}
                value={fmtPcs(report.totalHold)}
                detail={`${report.lotCount} lot${report.lotCount === 1 ? "" : "s"} with hold`}
                primary
              />
              <Kpi
                label="Lots on hold"
                basis={lotScopeLabel(t, STAGE_LABELS)}
                value={String(report.lotCount)}
                detail="Lots with HOLD > 0 in this range"
              />
              <Kpi
                label="Hold rate"
                basis={lotScopeLabel(t, STAGE_LABELS)}
                value={fmtPct(report.holdRate)}
                detail={`${fmtPcs(report.totalHold)} of ${fmtPcs(report.totalChecked)} checked`}
                tone={report.holdRate > 0.1 ? "warn" : "good"}
              />
              <Kpi
                label="Highest stage"
                basis={lotScopeLabel(t, STAGE_LABELS)}
                value={report.topStage ? fmtPcs(report.topStage.hold) : "—"}
                detail={report.topStage ? report.topStage.label : "No HOLD in range"}
              />
            </div>

            {report.trend.length > 0 && (
              <Card title={`Overall HOLD Trend (${grainLabel})`} sub="Pieces held, not a rate">
                <LineChart points={report.trend} fmt={fmtPcs} />
              </Card>
            )}

            {report.stageTrend.length > 0 && chartStages.length > 0 && (
              <Card
                title={`HOLD by Stage (${grainLabel})`}
                sub="Each colour is one station in process order"
              >
                <MultiLine
                  data={report.stageTrend}
                  stages={chartStages}
                  fmt={fmtPcs}
                  colorByStageId={colorByStageId}
                />
              </Card>
            )}

            {report.stageTrend.length > 0 && chartStages.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 16,
                }}
              >
                {chartStages.map((s) => {
                  const points = report.stageTrend.map((p) => ({
                    period: p.period,
                    label: p.label,
                    value: p.perStage[s.stageId] ?? 0,
                    rejected: p.counts?.[s.stageId]?.rejected,
                    checked: p.counts?.[s.stageId]?.checked,
                  }));
                  const color = colorByStageId[s.stageId];
                  return (
                    <Card key={s.stageId} title={s.label}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: color,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                          {fmtPcs(s.hold)} hold · {fmtPct(s.holdRate)} of {fmtPcs(s.checked)} checked
                        </span>
                      </div>
                      <LineChart
                        points={points}
                        fmt={fmtPcs}
                        color={color}
                        stage={s.label}
                        height={220}
                      />
                    </Card>
                  );
                })}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
                gap: 20,
              }}
            >
              <Card title="HOLD by station" sub="Share of held pieces">
                <BarsH
                  rows={chartStages.map((s) => ({
                    label: s.label,
                    value: s.hold,
                    sub: `${fmtPcs(s.hold)} · ${fmtPct(s.holdRate)}`,
                  }))}
                  fmt={fmtPcs}
                />
              </Card>
              <Card title="HOLD share">
                <Donut
                  data={chartStages.map((s) => ({
                    label: s.label,
                    value: s.hold,
                    color: colorByStageId[s.stageId],
                  }))}
                />
              </Card>
            </div>

            <section
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "16px 18px 18px",
                boxShadow: "var(--shadow-1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <div>
                  <h2
                    className="h3"
                    style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text)" }}
                  >
                    Stagewise HOLD by lot
                  </h2>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                    One row per lot. Columns follow the line. Empty cells have no HOLD at that station.
                  </p>
                </div>
                <input
                  type="search"
                  value={lotQuery}
                  onChange={(e) => setLotQuery(e.target.value)}
                  placeholder="Find lot…"
                  aria-label="Filter lots"
                  style={{
                    height: 34,
                    padding: "0 12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-strong)",
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    width: 200,
                  }}
                />
              </div>

              {batchRows.length === 0 ? (
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  {report.lotCount === 0
                    ? "No lots recorded HOLD in this range."
                    : "No lots match that code."}
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={thLeft}>Lot</th>
                        <th style={th}>Date</th>
                        {matrixStages.map((s) => (
                          <th key={s.stageId} style={th}>
                            {s.label}
                          </th>
                        ))}
                        <th style={th}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchRows.slice(0, 80).map((b) => (
                        <tr key={b.batch}>
                          <td style={tdMono}>{b.batch}</td>
                          <td style={tdMuted}>{b.date ?? "—"}</td>
                          {matrixStages.map((s) => {
                            const v = b.byStage[s.stageId] ?? 0;
                            return (
                              <td key={s.stageId} style={tdNum}>
                                {v > 0 ? fmtPcs(v) : "—"}
                              </td>
                            );
                          })}
                          <td style={{ ...tdNum, fontWeight: 700 }}>{fmtPcs(b.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {batchRows.length > 80 && (
                    <p className="muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
                      Showing 80 of {batchRows.length} lots. Narrow the lot search to see the rest.
                    </p>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

const th: CSSProperties = {
  textAlign: "right",
  padding: "8px 10px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};
const thLeft: CSSProperties = { ...th, textAlign: "left" };
const tdMono: CSSProperties = {
  padding: "8px 10px",
  fontFamily: "var(--font-mono)",
  fontWeight: 700,
  letterSpacing: "0.03em",
  borderBottom: "1px solid var(--border)",
  color: "var(--text)",
};
const tdMuted: CSSProperties = {
  padding: "8px 10px",
  color: "var(--text-3)",
  borderBottom: "1px solid var(--border)",
  fontVariantNumeric: "tabular-nums",
};
const tdNum: CSSProperties = {
  padding: "8px 10px",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  borderBottom: "1px solid var(--border)",
  color: "var(--text)",
};

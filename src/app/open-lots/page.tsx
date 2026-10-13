"use client";

import { useMemo, useState, type CSSProperties } from "react";
import AppShell from "@/components/app/AppShell";
import PageLoader from "@/components/app/PageLoader";
import { useEvents } from "@/components/app/EventsContext";
import { useTweaks } from "@/components/editorial/TweaksContext";
import { Card, Kpi, LineChart, Donut, seriesColor } from "@/components/app/widgets";
import {
  buildOpenLots,
  processLabel,
  PROCESS_ORDER,
  type ProcessId,
  type OpenLotRow,
} from "@/lib/analytics";
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
  const events = (contextEvents ?? []) as AuditEventLike[];
  const [lotQuery, setLotQuery] = useState("");
  const [group, setGroup] = useState<"open" | "complete" | "stalled" | ProcessId>("open");

  const report = useMemo(
    () =>
      buildOpenLots(events, {
        grain: t.grain,
        dateFrom: t.dateFrom,
        dateTo: t.dateTo,
      }),
    [events, t.grain, t.dateFrom, t.dateTo],
  );

  const q = lotQuery.trim().toUpperCase();
  const filtered = report.lots.filter((l) => !q || l.batch.includes(q));

  const grouped: { key: string; label: string; color?: string; rows: OpenLotRow[] }[] = [
    {
      key: "complete",
      label: "Line complete — Dipping, Secondary, and Assembly all done",
      rows: filtered.filter((l) => l.lineComplete),
    },
    {
      key: "stalled",
      label: "Stalled — no gate in 3+ days",
      color: "var(--warning)",
      rows: filtered.filter((l) => l.stalled),
    },
    ...PROCESS_ORDER.map((p) => ({
      key: p,
      label: `Waiting on ${processLabel(p)}`,
      color: PROCESS_COLOR[p],
      rows: filtered.filter((l) => l.open && l.waitingOn === p),
    })),
  ];

  const visibleGroups =
    group === "open"
      ? grouped.filter((g) => g.key !== "complete")
      : grouped.filter((g) => g.key === group);

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
              fontWeight: 800,
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
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, marginBottom: 8 }}>
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
              <Kpi label="Lots open" basis="Dipping, Secondary, and Assembly – all dates" value={String(report.openCount)} detail="Started, not all 3 processes" primary />
              <Kpi
                label="Stalled"
                basis="Dipping, Secondary, and Assembly – all dates"
                value={String(report.stalledCount)}
                detail="No gate in 3+ days"
                tone={report.stalledCount > 0 ? "warn" : "good"}
              />
              <Kpi label="Line complete" basis="Dipping, Secondary, and Assembly – all dates" value={String(report.lineCompleteCount)} detail="Dipping + Secondary + Assembly" />
              <Kpi label="Units waiting" basis="Dipping, Secondary, and Assembly – all dates" value={fmt(report.unitsWaiting)} detail="Accepted qty sitting mid-line" />
            </div>

            {report.completedTrend.length > 0 && (
              <Card title={`Cumulative completed lots (${grainLabel})`} sub="Lots that have cleared all three processes">
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
              <Card title="Complete vs waiting" sub="Waiting lots use their process colour">
                <Donut data={mixDonut} />
              </Card>
              <Card title="Process complete / not complete" sub="Among lots that have started the line">
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
              {report.processMix.map((p) => (
                <Card key={p.process} title={p.label}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
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
                      {p.complete} complete · {p.incomplete} not complete
                    </span>
                  </div>
                  <Donut
                    data={[
                      { label: "Complete", value: p.complete, color: PROCESS_COLOR[p.process] },
                      {
                        label: "Not complete",
                        value: p.incomplete,
                        color: "color-mix(in srgb, var(--text-3) 35%, transparent)",
                      },
                    ].filter((d) => d.value > 0)}
                  />
                </Card>
              ))}
            </div>

            <h2 className="h3" style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 600 }}>
              Stage split — complete vs not complete
            </h2>
            {PROCESS_ORDER.map((pid) => {
              const stages = report.stageClearance.filter((s) => s.process === pid);
              if (stages.length === 0) return null;
              return (
                <Card
                  key={pid}
                  title={processLabel(pid)}
                  sub="Lots that have this station vs lots that have not"
                >
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
                </Card>
              );
            })}

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
                  <h2 className="h3" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                    Lots by group
                  </h2>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                    Open lots first. Click a chip to filter.
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

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {(
                  [
                    ["open", "Open"],
                    ["stalled", "Stalled"],
                    ["complete", "Line complete"],
                    ...PROCESS_ORDER.map((p) => [p, processLabel(p)] as const),
                  ] as const
                ).map(([key, label]) => {
                  const active = group === key;
                  const color =
                    key === "complete"
                      ? "var(--positive)"
                      : key === "stalled"
                        ? "var(--warning)"
                        : key === "open"
                          ? "var(--text-2)"
                          : PROCESS_COLOR[key as ProcessId];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGroup(key)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 999,
                        border: active ? `1.5px solid ${color}` : "1px solid var(--border)",
                        background: active ? "var(--surface)" : "var(--surface-2)",
                        color: "var(--text)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {visibleGroups.map((g) => (
                <div key={g.key} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: g.color ?? "var(--text-2)",
                      marginBottom: 8,
                    }}
                  >
                    {g.label} · {g.rows.length}
                  </div>
                  {g.rows.length === 0 ? (
                    <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                      None in this group.
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th style={thLeft}>Lot</th>
                            <th style={th}>Last seen</th>
                            <th style={th}>Idle</th>
                            {PROCESS_ORDER.map((p) => (
                              <th key={p} style={{ ...th, color: PROCESS_COLOR[p] }}>
                                {processLabel(p)}
                              </th>
                            ))}
                            <th style={thLeft}>Next</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.slice(0, 60).map((l) => (
                            <tr key={l.batch}>
                              <td style={tdMono}>
                                <a
                                  href={`/audit?batch=${encodeURIComponent(l.batch)}`}
                                  style={{ color: "inherit", textDecoration: "none" }}
                                >
                                  {l.batch}
                                </a>
                              </td>
                              <td style={tdMuted}>{l.lastDate ?? "—"}</td>
                              <td style={tdNum}>
                                {l.stalled ? (
                                  <span style={{ color: "var(--warning)", fontWeight: 700 }}>{l.daysIdle}d</span>
                                ) : (
                                  `${l.daysIdle}d`
                                )}
                              </td>
                              {PROCESS_ORDER.map((p) => {
                                const c = l.processes[p];
                                return (
                                  <td key={p} style={tdNum}>
                                    <span style={{ color: c.complete ? PROCESS_COLOR[p] : "var(--text-3)" }}>
                                      {c.done}/{c.total}
                                    </span>
                                  </td>
                                );
                              })}
                              <td style={{ ...tdMuted, color: l.waitingOn ? PROCESS_COLOR[l.waitingOn] : "var(--text-3)" }}>
                                {l.lineComplete
                                  ? "—"
                                  : l.waitingOn
                                    ? l.processes[l.waitingOn].nextStageLabel ?? processLabel(l.waitingOn)
                                    : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </div>
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
};
const tdMuted: CSSProperties = {
  padding: "8px 10px",
  color: "var(--text-3)",
  borderBottom: "1px solid var(--border)",
};
const tdNum: CSSProperties = {
  padding: "8px 10px",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
  borderBottom: "1px solid var(--border)",
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
};

"use client";

// Chart builder — shared by Imported Files (one workbook) and the Dashboard
// (the whole ledger).
//
// The GM's ask was "let me pick the columns I care about and get a graph for
// those". Excel row/column selection doesn't translate — by the time a sheet is
// on the ledger it's events, not cells — so the equivalent question is asked in
// the plant's own terms instead: WHAT number, broken down BY what, filtered to
// which stages/sizes. Every combination is answered by the same deterministic
// selectors the KPI tiles use; nothing new is computed here, so a built chart
// can never disagree with the numbers above it.
//
// On the Dashboard the topbar's date range and stage View are inherited as a
// `baseScope`, so a built chart always answers the same question the rest of
// the page is answering. Pinned charts are remembered per surface.

import { useEffect, useMemo, useState } from "react";
import { Card, Empty, BarsH, LineChart, Donut } from "@/components/app/widgets";
import {
  byStage,
  byDefect,
  bySize,
  trend,
  periodsIn,
  DERIVED_REGISTRY,
  type Grain,
} from "@/lib/analytics";
import type { Event } from "@/lib/store/types";

type MetricId = "rejectionRate" | "totalRejected" | "totalChecked" | "totalAccepted" | "fpy";
type GroupId = "time" | "stage" | "size" | "defect";
/** "auto" keeps today's heuristic (line for time, donut for a handful of
 *  defect rows, bars otherwise) — every option past it is the user overriding
 *  that heuristic explicitly. */
type ChartType = "auto" | "line" | "bar" | "donut";
type SortOrder = "desc" | "asc" | "alpha";
type Weight = "thin" | "regular" | "bold";

export interface ChartSpec {
  id: string;
  metric: MetricId;
  group: GroupId;
  /** Only for group === "time". */
  grain: Grain;
  stageIds: string[];
  sizes: string[];
  /** Everything below is optional so a chart pinned before these existed
   *  keeps rendering exactly as it did — old specs just fall back to the
   *  defaults baked into ChartBody. */
  chartType?: ChartType;
  /** Rows kept in a stage/size/defect breakdown. `undefined` → 12 (today's fixed cap). */
  limit?: number;
  sortOrder?: SortOrder;
  /** Over-time only: dashed reference lines, reusing LineChart's own mean/target support. */
  showMean?: boolean;
  showTarget?: boolean;
  targetValue?: number;
  /** Visual thickness of whichever chart type renders — a line's stroke, a bar's track, a donut's ring. */
  weight?: Weight;
}

const METRICS: { id: MetricId; label: string; pct: boolean }[] = [
  { id: "rejectionRate", label: "Rejection rate", pct: true },
  { id: "totalRejected", label: "Rejected qty", pct: false },
  { id: "totalChecked", label: "Checked qty", pct: false },
  { id: "totalAccepted", label: "Accepted qty", pct: false },
];

const GROUPS: { id: GroupId; label: string }[] = [
  { id: "time", label: "Over time" },
  { id: "stage", label: "By stage" },
  { id: "size", label: "By size" },
  { id: "defect", label: "By defect" },
];

const GRAINS: { id: Grain; label: string }[] = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
];

const CHART_TYPES_TIME: { id: ChartType; label: string }[] = [
  { id: "auto", label: "Line (default)" },
  { id: "bar", label: "Bars" },
];

const CHART_TYPES_BREAKDOWN: { id: ChartType; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "bar", label: "Bars" },
  { id: "donut", label: "Donut" },
];

const LIMIT_OPTIONS = [5, 8, 10, 12, 20] as const;
const DEFAULT_LIMIT = 12;

const SORT_OPTIONS: { id: SortOrder; label: string }[] = [
  { id: "desc", label: "Highest first" },
  { id: "asc", label: "Lowest first" },
  { id: "alpha", label: "A → Z" },
];

const WEIGHT_OPTIONS: { id: Weight; label: string }[] = [
  { id: "thin", label: "Thin" },
  { id: "regular", label: "Regular" },
  { id: "bold", label: "Bold" },
];

/** Weight → the concrete pixel value each chart type's own prop expects. */
const STROKE_BY_WEIGHT: Record<Weight, number> = { thin: 1.5, regular: 2.25, bold: 3.5 };
const BAR_HEIGHT_BY_WEIGHT: Record<Weight, number> = { thin: 7, regular: 10, bold: 15 };
const RING_WIDTH_BY_WEIGHT: Record<Weight, number> = { thin: 12, regular: 20, bold: 30 };

const isPct = (m: MetricId) => METRICS.find((x) => x.id === m)?.pct ?? false;
const fmtValue = (m: MetricId) => (n: number) =>
  isPct(m) ? `${(n * 100).toFixed(2)}%` : Math.round(n).toLocaleString("en-IN");

export function describeSpec(spec: ChartSpec): string {
  const metric = METRICS.find((m) => m.id === spec.metric)?.label ?? (spec.metric === "fpy" ? "Accepted qty" : spec.metric);
  const group =
    spec.group === "time"
      ? GRAINS.find((g) => g.id === spec.grain)?.label.toLowerCase()
      : GROUPS.find((g) => g.id === spec.group)?.label.toLowerCase();
  return `${metric} · ${group}`;
}

/** Scope filters the host page already applies (Dashboard topbar range/View/Sources). */
export interface BaseScope {
  dateFrom?: string;
  dateTo?: string;
  stageIds?: string[];
  /** From header Sources control — Excel vs Data Entry / file picks. */
  sourceChannels?: import("@/lib/analytics/scope").SourceChannel[];
  sourceFiles?: string[];
}

export function scopeFor(spec: ChartSpec, base?: BaseScope) {
  // The builder's own stage picks NARROW the inherited View; they never widen
  // it, or a chart could show a stage the page above it has filtered out.
  const own = spec.stageIds.length ? spec.stageIds : undefined;
  const inherited = base?.stageIds?.length ? base.stageIds : undefined;
  const stageIds =
    own && inherited ? own.filter((s) => inherited.includes(s)) : (own ?? inherited);

  return {
    grain: spec.group === "time" ? spec.grain : ("month" as Grain),
    dateFrom: base?.dateFrom,
    dateTo: base?.dateTo,
    stageIds,
    sizes: spec.sizes.length ? spec.sizes : undefined,
    sourceChannels: base?.sourceChannels,
    sourceFiles: base?.sourceFiles,
  };
}

/**
 * Finest time grain that actually yields more than one point for these events.
 * A single month of daily rows charted monthly is one dot — which is what the
 * old fixed `grain: "month"` produced, and why this panel looked broken.
 */
export function bestGrain(events: Event[]): Grain {
  for (const g of ["day", "week", "month"] as Grain[]) {
    if (periodsIn(events, g).length > 1) return g;
  }
  return "day";
}

/** Rendered chart for one spec. Exported so the report renderer draws charts
 *  with the SAME code the screens use — a report can never diverge from what
 *  the GM saw on the page it came from. */
/** Sorts a breakdown's rows per the builder's own "Sort" control — value-desc
 *  matches the selectors' own ranking, so "Highest first" is a no-op sort. */
function applySortOrder<T extends { label: string; value: number }>(rows: T[], order: SortOrder): T[] {
  const sorted = [...rows];
  if (order === "alpha") sorted.sort((a, b) => a.label.localeCompare(b.label));
  else if (order === "asc") sorted.sort((a, b) => a.value - b.value);
  else sorted.sort((a, b) => b.value - a.value);
  return sorted;
}

export function ChartBody({ events, spec, base }: { events: Event[]; spec: ChartSpec; base?: BaseScope }) {
  const scope = scopeFor(spec, base);
  const fmt = fmtValue(spec.metric);
  const reg = DERIVED_REGISTRY;
  const weight = spec.weight ?? "regular";
  const chartType = spec.chartType ?? "auto";

  if (spec.group === "time") {
    const metricKey = spec.metric === "fpy" ? "totalAccepted" : spec.metric;
    const points = trend(events, scope, metricKey as any, reg);
    if (points.length < 2) {
      return <Empty label="Only one period in this file — pick a finer interval, or a breakdown instead of Over time." />;
    }
    if (chartType === "bar") {
      // Chronological, not ranked — a time axis has an order of its own.
      return (
        <BarsH
          rows={points.map((p) => ({ label: p.label, value: p.value }))}
          fmt={fmt}
          sort={false}
          barHeight={BAR_HEIGHT_BY_WEIGHT[weight]}
        />
      );
    }
    return (
      <LineChart
        points={points}
        fmt={fmt}
        metric={METRICS.find((m) => m.id === spec.metric)?.label ?? "Value"}
        height={240}
        mean={spec.showMean}
        target={spec.showTarget ? spec.targetValue : undefined}
        strokeWidth={STROKE_BY_WEIGHT[weight]}
      />
    );
  }

  const pick = (checked: number, rejected: number) => {
    switch (spec.metric) {
      case "totalChecked": return checked;
      case "totalRejected": return rejected;
      case "totalAccepted":
      case "fpy": return Math.max(0, checked - rejected);
      default: return checked > 0 ? rejected / checked : 0;
    }
  };

  let rows: { label: string; value: number; sub?: string }[] = [];

  if (spec.group === "stage") {
    rows = byStage(events, scope, reg).map((s) => ({
      // Files that never named their stages leave `label` empty — fall back to
      // the id, or the bar (and the filter chip) renders with no name at all.
      label: s.label || s.stageId,
      value: pick(s.checked, s.rejected),
      sub: spec.metric === "totalAccepted" || (spec.metric as string) === "fpy"
        ? `${Math.max(0, s.checked - s.rejected).toLocaleString("en-IN")} of ${s.checked.toLocaleString("en-IN")}`
        : `${s.rejected.toLocaleString("en-IN")} of ${s.checked.toLocaleString("en-IN")}`,
    }));
  } else if (spec.group === "size") {
    rows = bySize(events, scope).map((s) => ({
      label: s.size,
      value: pick(s.checked, s.rejected),
      sub: spec.metric === "totalAccepted" || (spec.metric as string) === "fpy"
        ? `${Math.max(0, s.checked - s.rejected).toLocaleString("en-IN")} of ${s.checked.toLocaleString("en-IN")}`
        : `${s.rejected.toLocaleString("en-IN")} of ${s.checked.toLocaleString("en-IN")}`,
    }));
  } else {
    // Defects are counts of rejects — a rate or a yield has no denominator here.
    rows = byDefect(events, scope, reg).map((d) => ({
      label: d.label || d.defectCode || "Unnamed",
      value: d.rejected,
      sub: `${d.pct.toFixed(1)}% of rejects`,
    }));
  }

  rows = applySortOrder(rows.filter((r) => r.value > 0), spec.sortOrder ?? "desc");

  if (rows.length === 0) {
    return (
      <Empty
        label={
          spec.group === "defect"
            ? "This file has no defect columns — its sheets record totals only. Import a file with per-defect columns, or log defects on Data Entry."
            : spec.group === "size"
              ? "No size-tagged rows in this file."
              : "No stage rows in this file."
        }
      />
    );
  }

  const limit = spec.limit ?? DEFAULT_LIMIT;
  const shown = rows.slice(0, limit);
  const wantsDonut =
    chartType === "donut" || (chartType === "auto" && spec.group === "defect" && rows.length > 2 && rows.length <= 8);

  if (wantsDonut) {
    return (
      <Donut
        data={shown.map((r) => ({ label: r.label, value: r.value }))}
        fmt={(n) => Math.round(n).toLocaleString("en-IN")}
        ringWidth={RING_WIDTH_BY_WEIGHT[weight]}
      />
    );
  }

  return (
    <BarsH
      rows={shown}
      fmt={spec.group === "defect" ? (n) => Math.round(n).toLocaleString("en-IN") : fmt}
      sort={false}
      barHeight={BAR_HEIGHT_BY_WEIGHT[weight]}
    />
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 9999,
        border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
        background: on ? "var(--accent)" : "var(--surface-2)",
        color: on ? "var(--text-invert)" : "var(--text-2)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export default function ChartBuilder({
  events,
  storageId,
  base,
  title = "Build your own chart",
  sub = "Pick what you want to see. Pin the ones you want to keep.",
}: {
  events: Event[];
  /** Namespaces the pinned charts — one workbook, or the whole dashboard. */
  storageId: string;
  base?: BaseScope;
  title?: string;
  sub?: string;
}) {
  const storageKey = `moid_charts:${storageId}`;

  /** Options come from the events AS THE HOST PAGE SCOPED THEM, so the chips
   *  can't offer a stage or size the current range has nothing for. */
  const optionScope = useMemo(
    () => ({ grain: "month" as Grain, dateFrom: base?.dateFrom, dateTo: base?.dateTo, stageIds: base?.stageIds }),
    [base?.dateFrom, base?.dateTo, base?.stageIds],
  );
  const stageOptions = useMemo(
    () => byStage(events, optionScope, DERIVED_REGISTRY).filter((s) => s.checked > 0 || s.rejected > 0),
    [events, optionScope],
  );
  const sizeOptions = useMemo(() => bySize(events, optionScope), [events, optionScope]);
  const defaultGrain = useMemo(() => bestGrain(events), [events]);

  const [draft, setDraft] = useState<ChartSpec>(() => ({
    id: "draft",
    metric: "rejectionRate",
    group: "time",
    grain: defaultGrain,
    stageIds: [],
    sizes: [],
    chartType: "auto",
    limit: DEFAULT_LIMIT,
    sortOrder: "desc",
    showMean: false,
    showTarget: false,
    targetValue: undefined,
    weight: "regular",
  }));
  const [pinned, setPinned] = useState<ChartSpec[]>([]);
  const [targetInput, setTargetInput] = useState("");

  useEffect(() => {
    setDraft((d) => ({ ...d, grain: defaultGrain }));
  }, [defaultGrain]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setPinned(raw ? (JSON.parse(raw) as ChartSpec[]) : []);
    } catch {
      setPinned([]);
    }
  }, [storageKey]);

  const persist = (next: ChartSpec[]) => {
    setPinned(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* storage full or blocked — the chart still renders this session */
    }
  };

  const toggle = (key: "stageIds" | "sizes", value: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
    }));

  const filterSummary = [
    draft.stageIds.length ? `${draft.stageIds.length} stage${draft.stageIds.length > 1 ? "s" : ""}` : null,
    draft.sizes.length ? `${draft.sizes.length} size${draft.sizes.length > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Card title={title} sub={sub}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            {/* Left: what to plot. Right: how to draw it — side by side so the
                wide empty gutter this card used to leave next to a handful of
                filter rows carries the second column instead of sitting idle. */}
            <div style={{ flex: "2 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
              <Row label="Show me">
                {METRICS.map((m) => (
                  <Chip key={m.id} on={draft.metric === m.id} onClick={() => setDraft((d) => ({ ...d, metric: m.id }))}>
                    {m.label}
                  </Chip>
                ))}
              </Row>

              <Row label="Broken down">
                {GROUPS.map((g) => (
                  <Chip key={g.id} on={draft.group === g.id} onClick={() => setDraft((d) => ({ ...d, group: g.id, chartType: "auto" }))}>
                    {g.label}
                  </Chip>
                ))}
                {draft.group === "time" && (
                  <>
                    <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 4px" }} />
                    {GRAINS.map((g) => (
                      <Chip key={g.id} on={draft.grain === g.id} onClick={() => setDraft((d) => ({ ...d, grain: g.id }))}>
                        {g.label}
                      </Chip>
                    ))}
                  </>
                )}
              </Row>

              {stageOptions.length > 1 && (
                <Row label="Only these stages">
                  <Chip on={draft.stageIds.length === 0} onClick={() => setDraft((d) => ({ ...d, stageIds: [] }))}>
                    All
                  </Chip>
                  {stageOptions.map((s) => (
                    <Chip key={s.stageId} on={draft.stageIds.includes(s.stageId)} onClick={() => toggle("stageIds", s.stageId)}>
                      {s.label || s.stageId}
                    </Chip>
                  ))}
                </Row>
              )}

              {sizeOptions.length > 1 && (
                <Row label="Only these sizes">
                  <Chip on={draft.sizes.length === 0} onClick={() => setDraft((d) => ({ ...d, sizes: [] }))}>
                    All
                  </Chip>
                  {sizeOptions.map((s) => (
                    <Chip key={s.size} on={draft.sizes.includes(s.size)} onClick={() => toggle("sizes", s.size)}>
                      {s.size}
                    </Chip>
                  ))}
                </Row>
              )}
            </div>

            <div
              style={{
                flex: "1 1 220px",
                maxWidth: 300,
                minWidth: 200,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--surface-2)",
              }}
            >
              <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
                Chart options
              </span>

              <OptRow label="Chart type">
                {(draft.group === "time" ? CHART_TYPES_TIME : CHART_TYPES_BREAKDOWN).map((c) => (
                  <Chip key={c.id} on={(draft.chartType ?? "auto") === c.id} onClick={() => setDraft((d) => ({ ...d, chartType: c.id }))}>
                    {c.label}
                  </Chip>
                ))}
              </OptRow>

              {draft.group !== "time" && (
                <>
                  <OptRow label="Show top">
                    {LIMIT_OPTIONS.map((n) => (
                      <Chip key={n} on={(draft.limit ?? DEFAULT_LIMIT) === n} onClick={() => setDraft((d) => ({ ...d, limit: n }))}>
                        {n}
                      </Chip>
                    ))}
                    <Chip on={(draft.limit ?? DEFAULT_LIMIT) === Infinity} onClick={() => setDraft((d) => ({ ...d, limit: Infinity }))}>
                      All
                    </Chip>
                  </OptRow>

                  <OptRow label="Sort">
                    {SORT_OPTIONS.map((s) => (
                      <Chip key={s.id} on={(draft.sortOrder ?? "desc") === s.id} onClick={() => setDraft((d) => ({ ...d, sortOrder: s.id }))}>
                        {s.label}
                      </Chip>
                    ))}
                  </OptRow>
                </>
              )}

              {draft.group === "time" && draft.chartType !== "bar" && (
                <OptRow label="Reference lines">
                  <Chip on={!!draft.showMean} onClick={() => setDraft((d) => ({ ...d, showMean: !d.showMean }))}>
                    Mean
                  </Chip>
                  <Chip on={!!draft.showTarget} onClick={() => setDraft((d) => ({ ...d, showTarget: !d.showTarget }))}>
                    Target
                  </Chip>
                  {draft.showTarget && (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={targetInput}
                      placeholder={isPct(draft.metric) ? "e.g. 15%" : "e.g. 500"}
                      onChange={(e) => setTargetInput(e.target.value)}
                      onBlur={() => {
                        const n = Number(targetInput.replace(/[^0-9.]/g, ""));
                        if (Number.isFinite(n) && n > 0) {
                          setDraft((d) => ({ ...d, targetValue: isPct(d.metric) ? n / 100 : n }));
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "4px 8px",
                        borderRadius: 9999,
                        border: "1px solid var(--border-strong)",
                        background: "var(--surface)",
                        color: "var(--text)",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        boxSizing: "border-box",
                      }}
                    />
                  )}
                </OptRow>
              )}

              <OptRow label="Weight">
                {WEIGHT_OPTIONS.map((w) => (
                  <Chip key={w.id} on={(draft.weight ?? "regular") === w.id} onClick={() => setDraft((d) => ({ ...d, weight: w.id }))}>
                    {w.label}
                  </Chip>
                ))}
              </OptRow>
            </div>
          </div>

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 14,
              background: "var(--bg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13 }}>{describeSpec(draft)}</strong>
              {filterSummary && (
                <span className="muted" style={{ fontSize: 12 }}>
                  filtered to {filterSummary}
                </span>
              )}
              <button
                type="button"
                onClick={() => persist([...pinned, { ...draft, id: `${Date.now()}` }])}
                style={{
                  marginLeft: "auto",
                  padding: "6px 14px",
                  borderRadius: 9999,
                  border: "1px solid var(--accent)",
                  background: "var(--accent)",
                  color: "var(--text-invert)",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Pin this chart
              </button>
            </div>
            <ChartBody events={events} spec={draft} base={base} />
          </div>
        </div>
      </Card>

      {pinned.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14, marginTop: 14 }}>
          {pinned.map((spec) => (
            <Card
              key={spec.id}
              title={describeSpec(spec)}
              sub={
                [
                  spec.stageIds.length ? `${spec.stageIds.length} stage(s)` : null,
                  spec.sizes.length ? `${spec.sizes.length} size(s)` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "All stages and sizes"
              }
            >
              <ChartBody events={events} spec={spec} base={base} />
              <button
                type="button"
                onClick={() => persist(pinned.filter((p) => p.id !== spec.id))}
                style={{
                  marginTop: 10,
                  padding: "3px 12px",
                  borderRadius: 9999,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  color: "var(--text-3)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span
        className="muted"
        style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, minWidth: 116 }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/** Same idea as Row, stacked — the Chart-options side panel is too narrow for
 *  a 116px label column without crowding the chips onto one cramped line. */
function OptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="muted" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>
        {label}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

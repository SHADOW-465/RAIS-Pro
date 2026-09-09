// src/lib/report/spec.ts
//
// What a report IS, as data.
//
// The GM does not want a CSV — he wants the charts he already looks at, laid
// out as a document, with control over what goes in it. So a report is an
// ordered list of BLOCKS, and every block names something this app can already
// compute. Nothing here does arithmetic: a block says "put the stage breakdown
// here", and the renderer asks `lib/analytics` for it, exactly as the screen
// does. A report and the screen it came from therefore cannot disagree.
//
// Chart blocks carry a `ChartSpec` verbatim — the same object the Dashboard and
// Imported Files chart builder already produce and persist. A configured chart
// was always the report primitive; this file just gives it a document to live in.

import type { ChartSpec } from "@/components/ChartBuilder";
import type { NavKey } from "@/lib/nav-keys";

/** A KPI tile the executive summary can show. */
export type KpiId = "rejectionRate" | "totalChecked" | "totalRejected" | "fpy" | "copq";

/** A prebuilt table the analytics layer can already produce. */
export type TableId = "by-stage" | "by-defect" | "by-size" | "spc-violations" | "capa-open";

export type ReportBlock =
  | { id: string; kind: "cover"; title: string; subtitle: string | null }
  | { id: string; kind: "kpi-row"; title: string; kpis: KpiId[] }
  | { id: string; kind: "chart"; title: string; spec: ChartSpec }
  | { id: string; kind: "table"; title: string; table: TableId }
  | { id: string; kind: "text"; title: string; body: string }
  /** Provenance appendix — file/sheet/cell lineage. This is where the old
   *  CSV-and-hashes export belongs: an optional appendix, not the whole thing. */
  | { id: string; kind: "evidence"; title: string }
  /**
   * Retired. Kept on the type so stored user presets still parse. The Reports
   * workspace no longer offers this block; renderers must not load ForensicBook.
   */
  | { id: string; kind: "forensic-book"; title: string };

export interface ReportSpec {
  /** Shown on the cover and in the print header. */
  title: string;
  /** Which screen this report was built from — reports stay page-shaped. */
  origin: NavKey;
  blocks: ReportBlock[];
}

export const BLOCK_LABEL: Record<ReportBlock["kind"], string> = {
  cover: "Cover page",
  "kpi-row": "Headline numbers",
  chart: "Chart",
  table: "Table",
  text: "Notes",
  evidence: "Data provenance appendix",
  "forensic-book": "Full forensic book",
};

export const KPI_LABEL: Record<KpiId, string> = {
  rejectionRate: "Rejection rate",
  totalChecked: "Units checked",
  totalRejected: "Units rejected",
  fpy: "First-pass yield",
  copq: "Cost of rejection",
};

export const TABLE_LABEL: Record<TableId, string> = {
  "by-stage": "Rejection by stage",
  "by-defect": "Defect Pareto",
  "by-size": "Rejection by size",
  "spc-violations": "Control-limit violations",
  "capa-open": "Open CAPA actions",
};

let seq = 0;
/** Block ids only need to be unique within one spec (React keys + reordering). */
export const blockId = (kind: string) => `${kind}-${++seq}`;

const chart = (title: string, spec: Omit<ChartSpec, "id">): ReportBlock => ({
  id: blockId("chart"),
  kind: "chart",
  title,
  spec: { ...spec, id: blockId("spec") } as ChartSpec,
});

/**
 * What each screen offers when you press Export.
 *
 * Same discipline as the topbar's per-page scope controls: a report built from
 * Defect Analysis is a defect report, not a generic dump. A screen absent from
 * this map has nothing report-worthy and shows no Export button at all — Plant
 * Schema, Settings and Data Entry are configuration surfaces, not findings.
 */
export const REPORT_PRESETS: Partial<Record<NavKey, () => ReportSpec>> = {
  dashboard: () => ({
    title: "Plant Quality Review",
    origin: "dashboard",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "Plant Quality Review", subtitle: null },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["rejectionRate", "totalChecked", "totalRejected", "fpy"] },
      chart("Rejection rate over time", { metric: "rejectionRate", group: "time", grain: "month", stageIds: [], sizes: [] }),
      { id: blockId("table"), kind: "table", title: "Rejection by stage", table: "by-stage" },
      chart("Where the rejections are", { metric: "totalRejected", group: "defect", grain: "month", stageIds: [], sizes: [] }),
    ],
  }),

  stage: () => ({
    title: "Stage Performance Review",
    origin: "stage",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "Stage Performance Review", subtitle: null },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["rejectionRate", "totalChecked", "fpy"] },
      chart("Rejection rate by stage", { metric: "rejectionRate", group: "stage", grain: "month", stageIds: [], sizes: [] }),
      { id: blockId("table"), kind: "table", title: "Rejection by stage", table: "by-stage" },
      chart("Stage trend", { metric: "rejectionRate", group: "time", grain: "month", stageIds: [], sizes: [] }),
    ],
  }),

  size: () => ({
    title: "Size-wise Rejection Review",
    origin: "size",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "Size-wise Rejection Review", subtitle: null },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["rejectionRate", "totalChecked", "totalRejected"] },
      chart("Rejection rate by size", { metric: "rejectionRate", group: "size", grain: "month", stageIds: [], sizes: [] }),
      { id: blockId("table"), kind: "table", title: "Rejection by size", table: "by-size" },
    ],
  }),

  defect: () => ({
    title: "Defect Analysis",
    origin: "defect",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "Defect Analysis", subtitle: null },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["totalRejected", "rejectionRate"] },
      chart("Defect Pareto", { metric: "totalRejected", group: "defect", grain: "month", stageIds: [], sizes: [] }),
      { id: blockId("table"), kind: "table", title: "Defect Pareto", table: "by-defect" },
      chart("Rejections over time", { metric: "totalRejected", group: "time", grain: "month", stageIds: [], sizes: [] }),
    ],
  }),

  spc: () => ({
    title: "Statistical Process Control",
    origin: "spc",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "Statistical Process Control", subtitle: null },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["rejectionRate", "fpy"] },
      chart("Rejection rate control chart", { metric: "rejectionRate", group: "time", grain: "day", stageIds: [], sizes: [] }),
      { id: blockId("table"), kind: "table", title: "Control-limit violations", table: "spc-violations" },
    ],
  }),

  copq: () => ({
    title: "Cost of Rejection",
    origin: "copq",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "Cost of Rejection", subtitle: null },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["copq", "totalRejected", "rejectionRate"] },
      chart("Rejected units over time", { metric: "totalRejected", group: "time", grain: "month", stageIds: [], sizes: [] }),
      { id: blockId("table"), kind: "table", title: "Rejection by stage", table: "by-stage" },
    ],
  }),

  "process-flow": () => ({
    title: "Process Flow Review",
    origin: "process-flow",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "Process Flow Review", subtitle: null },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["totalChecked", "fpy", "rejectionRate"] },
      { id: blockId("table"), kind: "table", title: "Rejection by stage", table: "by-stage" },
      chart("Yield by stage", { metric: "fpy", group: "stage", grain: "month", stageIds: [], sizes: [] }),
    ],
  }),

  capa: () => ({
    title: "CAPA Status Report",
    origin: "capa",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "CAPA Status Report", subtitle: null },
      { id: blockId("table"), kind: "table", title: "Open CAPA actions", table: "capa-open" },
      chart("Rejections driving CAPA", { metric: "totalRejected", group: "defect", grain: "month", stageIds: [], sizes: [] }),
    ],
  }),

  audit: () => ({
    title: "Audit Trail Extract",
    origin: "audit",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "Audit Trail Extract", subtitle: null },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["totalChecked", "totalRejected"] },
      { id: blockId("table"), kind: "table", title: "Rejection by stage", table: "by-stage" },
      { id: blockId("ev"), kind: "evidence", title: "Data provenance" },
    ],
  }),

  workbooks: () => ({
    title: "Imported File Report",
    origin: "workbooks",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "Imported File Report", subtitle: null },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["totalChecked", "totalRejected", "rejectionRate"] },
      { id: blockId("table"), kind: "table", title: "Rejection by stage", table: "by-stage" },
      { id: blockId("ev"), kind: "evidence", title: "Data provenance" },
    ],
  }),

  /** Default when opening /reports — short GM monthly, not the full forensic book. */
  reports: () => ({
    title: "GM Monthly Quality Summary",
    origin: "reports",
    blocks: [
      { id: blockId("cover"), kind: "cover", title: "GM Monthly Quality Summary", subtitle: "Management review — key figures only" },
      { id: blockId("kpi"), kind: "kpi-row", title: "Headline numbers", kpis: ["rejectionRate", "totalChecked", "totalRejected", "fpy", "copq"] },
      chart("Rejection rate over time", { metric: "rejectionRate", group: "time", grain: "month", stageIds: [], sizes: [] }),
      { id: blockId("table"), kind: "table", title: "Rejection by stage", table: "by-stage" },
      chart("Where the rejections are", { metric: "totalRejected", group: "defect", grain: "month", stageIds: [], sizes: [] }),
      { id: blockId("text"), kind: "text", title: "GM notes", body: "" },
    ],
  }),
};

/**
 * Retired forensic-book spec. Not selectable. Callers must not render it.
 * @deprecated Replaced by the Financial Year Audit Pack.
 */
export function forensicBookSpec(): ReportSpec {
  return {
    title: "Retired forensic package",
    origin: "reports",
    blocks: [],
  };
}

/** Fresh unique ids when cloning a saved/built-in preset into the editor. */
export function cloneSpec(spec: ReportSpec): ReportSpec {
  return {
    ...spec,
    blocks: spec.blocks.map((b) => ({
      ...b,
      id: blockId(b.kind),
      ...(b.kind === "chart"
        ? { spec: { ...b.spec, id: blockId("spec") } as ChartSpec }
        : {}),
    })) as ReportBlock[],
  };
}

/** Does this spec embed the full forensic book? */
export function isForensicSpec(spec: ReportSpec): boolean {
  return spec.blocks.some((b) => b.kind === "forensic-book");
}

/** Does this screen offer a report at all? */
export const canReport = (page: NavKey): boolean => page in REPORT_PRESETS;

/** A fresh spec for a screen, or null when the screen has nothing to report. */
export function presetFor(page: NavKey): ReportSpec | null {
  const make = REPORT_PRESETS[page];
  return make ? make() : null;
}

/** Blocks a user may ADD to a report built from this screen. */
export function availableBlocks(page: NavKey): ReportBlock[] {
  const extras: ReportBlock[] = [
    { id: blockId("table"), kind: "table", title: "Rejection by stage", table: "by-stage" },
    { id: blockId("table"), kind: "table", title: "Defect Pareto", table: "by-defect" },
    { id: blockId("table"), kind: "table", title: "Rejection by size", table: "by-size" },
    chart("Rejection rate over time", { metric: "rejectionRate", group: "time", grain: "month", stageIds: [], sizes: [] }),
    chart("Rejected units by stage", { metric: "totalRejected", group: "stage", grain: "month", stageIds: [], sizes: [] }),
    { id: blockId("text"), kind: "text", title: "Notes", body: "" },
    { id: blockId("ev"), kind: "evidence", title: "Data provenance" },
  ];
  return canReport(page) ? extras : [];
}

export const moveBlock = (blocks: ReportBlock[], index: number, delta: number): ReportBlock[] => {
  const to = index + delta;
  if (to < 0 || to >= blocks.length) return blocks;
  const next = [...blocks];
  const [b] = next.splice(index, 1);
  next.splice(to, 0, b);
  return next;
};

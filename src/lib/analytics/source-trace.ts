// View Source classification — progressive structure for metric provenance.
// Mirrors Audit trail discipline: summarize → group → open one slice → detail.
// Never invents quantities; only rolls up rows already attached to the metric.

export type SourceKind = "checked" | "accepted" | "rejected" | "defect" | "other";

export type SourceGroupMode =
  | "stage"
  | "period"
  | "file"
  | "type"
  | "size"
  | "defect"
  | "flat";

/** Hints the modal which default group mode + summary to use. */
export type SourceMetricKind =
  | "rejection_rate"
  | "checked"
  | "rejected"
  | "pareto"
  | "size"
  | "copq"
  | "generic";

export type SourcePeriodGrain = "day" | "week" | "month" | "fiscal-year";

export interface SourceRow {
  date: string;
  /** Display label (e.g. "Visual Inspection"). */
  stage: string;
  /** Canonical stage id for sort/group when known. */
  stageId?: string;
  size?: string | null;
  /** Legacy concatenated label kept for callers/tests. */
  type: string;
  kind: SourceKind;
  defectCode?: string | null;
  batch?: string | null;
  qty: number | string;
  file: string;
  fileHash?: string | null;
  sheet?: string;
  cell: string;
  isDirect?: boolean;
}

export interface SourceRowFilter {
  stageId?: string;
  defectCode?: string;
  size?: string;
  types?: string[];
}

export interface SourceTraceFilters {
  source: "all" | "excel" | "manual";
  stageId: string; // "all" | id
  size: string; // "all" | size id
  kind: "all" | SourceKind;
  search: string;
}

export interface SourceSummary {
  recordCount: number;
  excelCount: number;
  manualCount: number;
  fileCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  checkedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  defectQty: number;
  /** Top group label for the default mode (stage / defect / size). */
  topDriver: { label: string; sharePct: number; mode: SourceGroupMode } | null;
  stageBreakdown: { key: string; label: string; count: number; rejectedQty: number }[];
}

export interface SourceGroup {
  key: string;
  label: string;
  rows: SourceRow[];
  recordCount: number;
  checkedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  defectQty: number;
  /** Share of primary qty among siblings (0–100). */
  contributionPct: number;
  source: "manual" | "excel" | "mixed";
  fileCount: number;
}

const STAGE_ORDER = ["visual", "eye-punching", "balloon", "valve-integrity", "final"];

export const STAGE_LABELS: Record<string, string> = {
  visual: "Visual Inspection",
  "eye-punching": "Eye Punching",
  balloon: "Balloon Testing",
  "valve-integrity": "Valve Integrity",
  final: "Final Inspection",
};

const KIND_ORDER: SourceKind[] = ["checked", "accepted", "rejected", "defect", "other"];

export function fileBasename(path: string): string {
  if (!path) return "—";
  return path.split(/[\\/]/).pop() || path;
}

export function qtyNumber(qty: number | string | undefined | null): number {
  if (typeof qty === "number" && Number.isFinite(qty)) return qty;
  if (typeof qty === "string") {
    const n = Number(qty.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function stageSortKey(stageId: string | undefined, stageLabel: string): number {
  const id = (stageId || stageLabel || "").toLowerCase();
  const idx = STAGE_ORDER.indexOf(id);
  if (idx >= 0) return idx;
  // label may be pretty; try matching STAGE_LABELS values
  for (let i = 0; i < STAGE_ORDER.length; i++) {
    if (STAGE_LABELS[STAGE_ORDER[i]]?.toLowerCase() === stageLabel.toLowerCase()) return i;
  }
  return 99;
}

/** Infer kind from event fields or legacy type string. */
export function inferSourceKind(input: {
  eventType?: string;
  disposition?: string;
  defectCode?: string | null;
  type?: string;
}): SourceKind {
  const et = (input.eventType || "").toLowerCase();
  const disp = (input.disposition || "").toLowerCase();
  const defect = input.defectCode || "";
  const type = (input.type || "").toLowerCase();

  if (et === "rejection" || defect || type.includes("rejection") || /\bdefect\b/.test(type)) {
    // inspection·rejected with defect code → defect; bare rejection → defect if code else rejected
    if (defect || /rejection\s+\S+/.test(type) || type.includes("defect")) return "defect";
    if (et === "rejection") return "defect";
  }
  if (et === "production" || type.startsWith("production")) return "checked";
  if (et === "inspection") {
    if (disp === "rejected" || type.includes("rejected")) return "rejected";
    if (disp === "accepted" || disp === "good" || type.includes("accepted") || type.includes("good")) {
      return "accepted";
    }
    return "checked";
  }
  if (type.includes("·rejected") || type.includes("inspection·rejected")) return "rejected";
  if (type.includes("·accepted") || type.includes("·good")) return "accepted";
  if (type.startsWith("production")) return "checked";
  return "other";
}

export function kindLabel(kind: SourceKind, defectCode?: string | null): string {
  switch (kind) {
    case "checked":
      return "Checked";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "defect":
      return defectCode ? `Defect · ${defectCode}` : "Defect";
    default:
      return "Other";
  }
}

/** Ensure rows have kind/stageId; parse legacy type soup when needed. */
export function normalizeSourceRows(rows: SourceRow[]): SourceRow[] {
  return rows.map((r) => {
    const stageId =
      r.stageId ||
      Object.entries(STAGE_LABELS).find(([, lab]) => lab === r.stage)?.[0] ||
      (STAGE_ORDER.includes((r.stage || "").toLowerCase()) ? r.stage.toLowerCase() : undefined);
    const defectFromType =
      r.defectCode ||
      (() => {
        const m = /\brejection\s+([A-Za-z0-9_-]+)/i.exec(r.type || "");
        if (m) return m[1];
        const m2 = /\bDEFECT:([A-Za-z0-9_-]+)/i.exec(r.type || "");
        return m2?.[1] ?? null;
      })();
    const kind = r.kind || inferSourceKind({ type: r.type, defectCode: defectFromType });
    return {
      ...r,
      stageId,
      kind,
      defectCode: r.defectCode ?? defectFromType,
      file: r.file || "Manual Entry",
    };
  });
}

/**
 * Map canonical ledger events → provenance rows for View Source.
 * Shared by Dashboard, analytics pages, and Workbooks.
 */
export function toSourceRows(
  events: unknown[],
  filter: SourceRowFilter = {},
): SourceRow[] {
  const out: SourceRow[] = [];
  for (const raw of events as any[]) {
    if (filter.types && !filter.types.includes(raw.eventType)) continue;
    if (filter.stageId && raw.stageId !== filter.stageId) continue;
    if (filter.size && raw.size !== filter.size) continue;
    if (
      filter.defectCode &&
      raw.defectCodeRaw !== filter.defectCode &&
      raw.defectCode !== filter.defectCode
    ) {
      continue;
    }
    const prov = raw.provenance ?? {};
    const stageId = raw.stageId ?? undefined;
    const defectCode = raw.defectCodeRaw ?? raw.defectCode ?? null;
    const kind = inferSourceKind({
      eventType: raw.eventType,
      disposition: raw.disposition,
      defectCode,
    });
    const type =
      raw.eventType +
      (raw.disposition ? `·${raw.disposition}` : "") +
      (defectCode ? ` ${defectCode}` : "");
    const batch =
      raw.batchNo ??
      raw.customFields?.batch ??
      raw.customFields?.batchId ??
      null;
    out.push({
      date: raw.occurredOn?.start ?? "—",
      stage: STAGE_LABELS[stageId ?? ""] ?? stageId ?? "—",
      stageId,
      size: raw.size ?? null,
      type,
      kind,
      defectCode,
      batch: typeof batch === "string" && batch.trim() ? batch.trim() : null,
      qty: raw.quantity ?? raw.statedValue ?? "—",
      file: prov.file ?? "Manual Entry",
      fileHash: prov.fileHash ?? null,
      sheet: prov.sheet,
      cell: prov.cells?.[0] ?? "ENTRY",
      isDirect:
        prov.is_direct_entry === true ||
        raw.extractedBy === "direct-entry" ||
        raw.isDirectEntry === true,
    });
  }
  return sortSourceDetail(out);
}

export function defaultGroupMode(metricKind: SourceMetricKind = "generic"): SourceGroupMode {
  switch (metricKind) {
    case "pareto":
      return "defect";
    case "size":
      return "size";
    case "checked":
    case "rejected":
    case "rejection_rate":
    case "copq":
    case "generic":
    default:
      return "stage";
  }
}

export function defaultSourceFilters(): SourceTraceFilters {
  return {
    source: "all",
    stageId: "all",
    size: "all",
    kind: "all",
    search: "",
  };
}

export function filterSourceRows(
  rows: SourceRow[],
  filters: SourceTraceFilters,
): SourceRow[] {
  const q = filters.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.source === "excel" && r.isDirect) return false;
    if (filters.source === "manual" && !r.isDirect) return false;
    if (filters.stageId !== "all") {
      const id = r.stageId || r.stage;
      if (id !== filters.stageId && r.stage !== filters.stageId) return false;
    }
    if (filters.size !== "all" && (r.size || "") !== filters.size) return false;
    if (filters.kind !== "all" && r.kind !== filters.kind) return false;
    if (q) {
      const hay = [
        r.date,
        r.stage,
        r.stageId,
        r.size,
        r.type,
        r.kind,
        r.defectCode,
        r.batch,
        r.file,
        fileBasename(r.file),
        r.cell,
        r.sheet,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function periodKey(date: string, grain: SourcePeriodGrain): string {
  if (!date || date === "—") return "(unknown period)";
  if (grain === "day") return date.slice(0, 10);
  if (grain === "month" || grain === "fiscal-year") return date.slice(0, 7) || date;
  // week: ISO year-week rough (Mon-based via UTC)
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date.slice(0, 7) || date;
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function periodLabel(key: string, grain: SourcePeriodGrain): string {
  if (key.startsWith("(")) return key;
  if (grain === "day") return key;
  if (grain === "week") return key.replace("-W", " · W");
  // month
  const [y, m] = key.split("-");
  if (y && m) {
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mi = Number(m) - 1;
    return `${names[mi] ?? m} ${y}`;
  }
  return key;
}

function groupKeyFor(row: SourceRow, mode: SourceGroupMode, grain: SourcePeriodGrain): { key: string; label: string } {
  switch (mode) {
    case "stage": {
      const key = row.stageId || row.stage || "(unknown stage)";
      return { key, label: row.stage || key };
    }
    case "period": {
      const key = periodKey(row.date, grain);
      return { key, label: periodLabel(key, grain) };
    }
    case "file": {
      const key = fileBasename(row.file).toLowerCase();
      return { key, label: fileBasename(row.file) };
    }
    case "type": {
      const key = row.kind;
      return { key, label: kindLabel(row.kind, null) };
    }
    case "size": {
      const key = row.size || "(no size)";
      return { key, label: row.size || "No size" };
    }
    case "defect": {
      if (row.kind === "defect" || row.defectCode) {
        const code = row.defectCode || "UNKNOWN";
        return { key: code, label: code };
      }
      return { key: "(non-defect)", label: "Non-defect rows" };
    }
    case "flat":
    default:
      return { key: "all", label: "All records" };
  }
}

function rollup(rows: SourceRow[]) {
  let checkedQty = 0;
  let acceptedQty = 0;
  let rejectedQty = 0;
  let defectQty = 0;
  const files = new Set<string>();
  let excel = 0;
  let manual = 0;
  for (const r of rows) {
    const q = qtyNumber(r.qty);
    if (r.kind === "checked") checkedQty += q;
    else if (r.kind === "accepted") acceptedQty += q;
    else if (r.kind === "rejected") rejectedQty += q;
    else if (r.kind === "defect") defectQty += q;
    files.add(fileBasename(r.file).toLowerCase());
    if (r.isDirect) manual++;
    else excel++;
  }
  const source: "manual" | "excel" | "mixed" =
    excel > 0 && manual > 0 ? "mixed" : manual > 0 ? "manual" : "excel";
  return { checkedQty, acceptedQty, rejectedQty, defectQty, fileCount: files.size, source, excel, manual };
}

/** Primary quantity for ranking groups given metric kind. */
export function primaryQty(
  roll: { checkedQty: number; rejectedQty: number; defectQty: number; acceptedQty: number },
  metricKind: SourceMetricKind,
): number {
  switch (metricKind) {
    case "checked":
      return roll.checkedQty || roll.acceptedQty;
    case "pareto":
      return roll.defectQty || roll.rejectedQty;
    case "rejected":
    case "rejection_rate":
    case "copq":
      return roll.rejectedQty + roll.defectQty || roll.checkedQty;
    case "size":
    case "generic":
    default:
      return roll.rejectedQty + roll.defectQty || roll.checkedQty || roll.acceptedQty;
  }
}

export function groupSourceRows(
  rows: SourceRow[],
  mode: SourceGroupMode,
  opts: { grain?: SourcePeriodGrain; metricKind?: SourceMetricKind } = {},
): SourceGroup[] {
  const grain = opts.grain ?? "month";
  const metricKind = opts.metricKind ?? "generic";
  const normalized = normalizeSourceRows(rows);

  if (mode === "flat") {
    const sorted = sortSourceDetail(normalized);
    const r = rollup(sorted);
    return [
      {
        key: "all",
        label: "All records",
        rows: sorted,
        recordCount: sorted.length,
        checkedQty: r.checkedQty,
        acceptedQty: r.acceptedQty,
        rejectedQty: r.rejectedQty,
        defectQty: r.defectQty,
        contributionPct: 100,
        source: r.source,
        fileCount: r.fileCount,
      },
    ];
  }

  const map = new Map<string, { label: string; rows: SourceRow[] }>();
  for (const row of normalized) {
    const { key, label } = groupKeyFor(row, mode, grain);
    const cur = map.get(key);
    if (cur) cur.rows.push(row);
    else map.set(key, { label, rows: [row] });
  }

  const groups: SourceGroup[] = [];
  for (const [key, { label, rows: gr }] of map) {
    const sorted = sortSourceDetail(gr);
    const r = rollup(sorted);
    groups.push({
      key,
      label,
      rows: sorted,
      recordCount: sorted.length,
      checkedQty: r.checkedQty,
      acceptedQty: r.acceptedQty,
      rejectedQty: r.rejectedQty,
      defectQty: r.defectQty,
      contributionPct: 0,
      source: r.source,
      fileCount: r.fileCount,
    });
  }

  const totalPrimary = groups.reduce((s, g) => s + primaryQty(g, metricKind), 0) || 1;
  for (const g of groups) {
    g.contributionPct = (primaryQty(g, metricKind) / totalPrimary) * 100;
  }

  groups.sort((a, b) => {
    const pa = primaryQty(a, metricKind);
    const pb = primaryQty(b, metricKind);
    if (pb !== pa) return pb - pa;
    if (mode === "stage") {
      return stageSortKey(a.key, a.label) - stageSortKey(b.key, b.label);
    }
    if (mode === "period") return b.key.localeCompare(a.key);
    return a.label.localeCompare(b.label);
  });

  return groups;
}

export function sortSourceDetail(rows: SourceRow[]): SourceRow[] {
  const norm = normalizeSourceRows(rows);
  return [...norm].sort((a, b) => {
    const d = (b.date || "").localeCompare(a.date || "");
    if (d) return d;
    const sa = stageSortKey(a.stageId, a.stage);
    const sb = stageSortKey(b.stageId, b.stage);
    if (sa !== sb) return sa - sb;
    const ka = KIND_ORDER.indexOf(a.kind);
    const kb = KIND_ORDER.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    const size = (a.size || "").localeCompare(b.size || "");
    if (size) return size;
    return fileBasename(a.file).localeCompare(fileBasename(b.file));
  });
}

export function summarizeSource(
  rows: SourceRow[],
  metricKind: SourceMetricKind = "generic",
): SourceSummary {
  const normalized = normalizeSourceRows(rows);
  const r = rollup(normalized);
  let dateFrom: string | null = null;
  let dateTo: string | null = null;
  for (const row of normalized) {
    const d = row.date?.slice(0, 10);
    if (!d || d === "—") continue;
    if (!dateFrom || d < dateFrom) dateFrom = d;
    if (!dateTo || d > dateTo) dateTo = d;
  }

  const mode = defaultGroupMode(metricKind);
  const groups = groupSourceRows(normalized, mode === "flat" ? "stage" : mode, { metricKind });
  const top = groups[0] && groups[0].recordCount > 0
    ? { label: groups[0].label, sharePct: groups[0].contributionPct, mode }
    : null;

  const stageGroups = groupSourceRows(normalized, "stage", { metricKind });
  const stageBreakdown = stageGroups.map((g) => ({
    key: g.key,
    label: g.label,
    count: g.recordCount,
    rejectedQty: g.rejectedQty + g.defectQty,
  }));

  return {
    recordCount: normalized.length,
    excelCount: r.excel,
    manualCount: r.manual,
    fileCount: r.fileCount,
    dateFrom,
    dateTo,
    checkedQty: r.checkedQty,
    acceptedQty: r.acceptedQty,
    rejectedQty: r.rejectedQty,
    defectQty: r.defectQty,
    topDriver: top,
    stageBreakdown,
  };
}

/** Unique stage options present in rows (for filter chips). */
export function stageOptionsFromRows(rows: SourceRow[]): { id: string; label: string }[] {
  const map = new Map<string, string>();
  for (const r of normalizeSourceRows(rows)) {
    const id = r.stageId || r.stage || "(unknown)";
    if (!map.has(id)) map.set(id, r.stage || id);
  }
  return [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => stageSortKey(a.id, a.label) - stageSortKey(b.id, b.label));
}

export function sizeOptionsFromRows(rows: SourceRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) if (r.size) set.add(r.size);
  return [...set].sort();
}

export const DETAIL_PAGE_SIZE = 50;

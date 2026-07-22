// Cluster uploaded workbooks the way plant folders do on disk
// (e.g. ANALYTICAL DATA/REJECTION ANALYSIS 2025-26/*.xlsx).
// Pure string heuristics over basenames — no filesystem access.

export interface ClusterableFile {
  snapshotId: string;
  fileName: string;
  uploadedAt?: string;
}

export interface WorkbookCluster<T extends ClusterableFile = ClusterableFile> {
  /** Stable key for React / state */
  key: string;
  /** Human folder label */
  label: string;
  /** Short badge: "Monthly series", "Report", … */
  kind: "series" | "report" | "other";
  files: T[];
}

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";

/** Basename only (handles paths). */
export function fileBasename(path: string): string {
  return (path || "").split(/[\\/]/).pop() || path || "—";
}

/**
 * Strip month / year / leading sequence so
 * "01 REJECTION ANALYSIS-APRIL 2025.xlsx" and
 * "12 REJECTION ANALYSIS-MARCH 2026.xlsx" share a stem.
 */
export function clusterStem(fileName: string): string {
  let s = fileBasename(fileName);
  s = s.replace(/\.(xlsx|xls|xlsm|csv)$/i, "");
  // leading sequence: "01 ", "1.", "12-"
  s = s.replace(/^\d{1,2}[\s.\-_]+/, "");
  // month names
  s = s.replace(new RegExp(`\\b(${MONTHS})\\b`, "gi"), " ");
  // fiscal / calendar years
  s = s.replace(/\b20\d{2}(?:\s*[-–/]\s*\d{2,4})?\b/g, " ");
  // trailing short year "26" "27" after month strip left alone as noise
  s = s.replace(/\b['’]?\d{2}\b/g, " ");
  // punctuation → space
  s = s.replace(/[&/,_\-.]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.toUpperCase() || fileBasename(fileName).toUpperCase();
}

/** Map known plant stems to tidy folder titles (folder-like). */
function prettyLabel(stem: string): { label: string; kind: WorkbookCluster["kind"] } {
  const s = stem.toUpperCase();

  if (/REJECTION\s*ANALYSIS/.test(s) || /^REJECTION ANALYSIS$/.test(s)) {
    return { label: "Rejection analysis", kind: "series" };
  }
  if (/YEARLY\s*ANALYSIS|YEARLY\s*PRODUCTION/.test(s)) {
    return { label: "Yearly analysis", kind: "report" };
  }
  if (/VISUAL\s*INSPECTION/.test(s)) {
    return { label: "Visual inspection", kind: "series" };
  }
  if (/VALVE\s*INTEGRITY|BALLOON/.test(s)) {
    return { label: "Valve & balloon integrity", kind: "series" };
  }
  if (/FINAL\s*INSPECTION/.test(s)) {
    return { label: "Final inspection", kind: "series" };
  }
  if (/DAILY\s*ACTIVITY/.test(s)) {
    return { label: "Daily activity report", kind: "series" };
  }
  if (/COMM?ULATIVE|CUMULATIVE/.test(s)) {
    return { label: "Cumulative", kind: "report" };
  }
  if (/SIZE\s*WISE|SIZEWISE/.test(s)) {
    return { label: "Size-wise rejection", kind: "series" };
  }
  if (/ASSEMBLY\s*REJECTION/.test(s)) {
    return { label: "Assembly rejection", kind: "report" };
  }
  if (/SHOP\s*FLOOR|SHOPFLOOR/.test(s)) {
    return { label: "Shopfloor rejection", kind: "report" };
  }
  // Pure month-day dumps with empty stem after strip
  if (!s || s.length < 3) {
    return { label: "Other monthly sheets", kind: "other" };
  }
  // Title case residual stem
  const label = s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { label: label || "Other uploads", kind: "other" };
}

/**
 * Group files into plant-style folders. Larger clusters first; within a
 * cluster, sort by uploadedAt desc then name.
 */
export function clusterWorkbooks<T extends ClusterableFile>(files: T[]): WorkbookCluster<T>[] {
  const map = new Map<string, T[]>();
  for (const f of files) {
    const stem = clusterStem(f.fileName);
    const arr = map.get(stem);
    if (arr) arr.push(f);
    else map.set(stem, [f]);
  }

  const clusters: WorkbookCluster<T>[] = [];
  for (const [stem, group] of map) {
    const { label, kind } = prettyLabel(stem);
    const sorted = [...group].sort((a, b) => {
      const ta = a.uploadedAt ?? "";
      const tb = b.uploadedAt ?? "";
      if (tb !== ta) return tb.localeCompare(ta);
      return fileBasename(a.fileName).localeCompare(fileBasename(b.fileName));
    });
    clusters.push({
      key: stem,
      label,
      kind,
      files: sorted,
    });
  }

  // Prefer multi-file series first, then by label
  clusters.sort((a, b) => {
    if (b.files.length !== a.files.length) return b.files.length - a.files.length;
    return a.label.localeCompare(b.label);
  });

  // Merge clusters that resolved to the same pretty label (e.g. slight stem drift)
  const byLabel = new Map<string, WorkbookCluster<T>>();
  for (const c of clusters) {
    const existing = byLabel.get(c.label);
    if (!existing) {
      byLabel.set(c.label, c);
      continue;
    }
    existing.files = [...existing.files, ...c.files].sort((a, b) => {
      const ta = a.uploadedAt ?? "";
      const tb = b.uploadedAt ?? "";
      if (tb !== ta) return tb.localeCompare(ta);
      return fileBasename(a.fileName).localeCompare(fileBasename(b.fileName));
    });
    if (existing.kind === "other" && c.kind !== "other") existing.kind = c.kind;
  }

  return [...byLabel.values()].sort((a, b) => {
    if (b.files.length !== a.files.length) return b.files.length - a.files.length;
    return a.label.localeCompare(b.label);
  });
}

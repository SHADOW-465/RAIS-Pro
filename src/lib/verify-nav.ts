// src/lib/verify-nav.ts
//
// Pure helpers for the Verify-mode navigation: classify the sheets inside an
// uploaded workbook (months / summary / other), order months chronologically,
// build per-file groups, and compute lightweight per-sheet stats + column
// totals. No React, no DOM — unit-testable.

import type { RawSheet } from "@/types/dashboard";
import type { MergePlan } from "@/types/analysis";

// ─── fuzzy column matching (single source of truth) ──────────────────────────

/** Normalize a column name for fuzzy matching. */
export function normalizeColName(s: string): string {
  return s.toLowerCase().replace(/[\s_\-().]/g, "");
}

/** Find the best-matching real column name for a target (exact, then partial). */
export function findColumn(target: string, columns: string[]): string | null {
  const t = normalizeColName(target);
  if (!t) return null;
  const exact = columns.find((c) => normalizeColName(c) === t);
  if (exact) return exact;
  const partial = columns.find((c) => {
    const n = normalizeColName(c);
    return n.length > 0 && (n.includes(t) || t.includes(n));
  });
  return partial ?? null;
}

// ─── month parsing ───────────────────────────────────────────────────────────

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export interface MonthInfo {
  /** e.g. "April 2025" */
  label: string;
  /** sortable key: year*12 + monthIndex */
  sortIndex: number;
  monthIndex: number; // 0-11
  year: number;
}

/**
 * Parse a sheet name like "APRIL 25", "April 2025", "JANUARY 26" into a month.
 * Returns null when the name isn't a month sheet.
 */
export function parseMonth(sheetName: string): MonthInfo | null {
  const s = sheetName.toLowerCase();

  let monthIndex = MONTHS.findIndex((m) => s.includes(m));
  if (monthIndex === -1) {
    monthIndex = MONTH_ABBR.findIndex((m) => new RegExp(`\\b${m}\\b`).test(s));
  }
  if (monthIndex === -1) return null;

  // Find a year token: prefer a 4-digit 20xx, else a trailing 2-digit group.
  let year = 0;
  const y4 = s.match(/\b(20\d{2})\b/);
  if (y4) {
    year = parseInt(y4[1], 10);
  } else {
    const digits = s.match(/\d{1,4}/g) ?? [];
    // last 1-2 digit token is most likely the year (e.g. "april 25")
    for (let i = digits.length - 1; i >= 0; i--) {
      const n = parseInt(digits[i], 10);
      if (digits[i].length <= 2) { year = 2000 + n; break; }
      if (digits[i].length === 4) { year = n; break; }
    }
  }

  const label = `${MONTHS[monthIndex][0].toUpperCase()}${MONTHS[monthIndex].slice(1)}${year ? " " + year : ""}`;
  return { label, sortIndex: year * 12 + monthIndex, monthIndex, year };
}

// ─── sheet classification & file grouping ────────────────────────────────────

export type SheetKind = "month" | "summary" | "other";

export interface SheetEntry {
  /** index into the original sheets[] array */
  index: number;
  sheet: RawSheet;
  fileName: string;
  /** the sheet portion of the name (after "file - ") */
  sheetName: string;
  /** human label: month label, or the sheet name */
  label: string;
  kind: SheetKind;
  month: MonthInfo | null;
  /** present in the merge plan's excluded list (rollup/template) */
  excluded: boolean;
  excludedReason?: string;
}

export interface FileGroup {
  fileName: string;
  /** chronological months (data sheets) */
  months: SheetEntry[];
  /** yearly / cumulative rollups */
  summaries: SheetEntry[];
  /** templates / stray sheets */
  others: SheetEntry[];
  /** every entry, ordered: months (chrono) → summaries → others */
  ordered: SheetEntry[];
}

const SUMMARY_RE = /year|cumul|commulative|summary|rollup|grand\s*total|consolidat/i;

function classifyKind(sheetName: string, month: MonthInfo | null): SheetKind {
  if (month) return "month";
  if (SUMMARY_RE.test(sheetName)) return "summary";
  return "other";
}

/** Split "FILE - SHEET" into its sheet portion (falls back to the whole name). */
export function sheetNameOf(rawName: string): string {
  const idx = rawName.indexOf(" - ");
  return idx >= 0 ? rawName.slice(idx + 3) : rawName;
}

/**
 * Group raw sheets by file and classify/sort the sheets within each file.
 * `mergePlan.excludedSheets` (when provided) marks rollup/template sheets.
 */
export function buildFileGroups(sheets: RawSheet[], mergePlan?: MergePlan): FileGroup[] {
  const excluded = new Map<string, string>();
  for (const e of mergePlan?.excludedSheets ?? []) excluded.set(e.sheet, e.reason);

  const byFile = new Map<string, SheetEntry[]>();

  sheets.forEach((sheet, index) => {
    const sheetName = sheetNameOf(sheet.name);
    const month = parseMonth(sheetName);
    const reason = excluded.get(sheet.name);
    const kind = classifyKind(sheetName, month);
    const entry: SheetEntry = {
      index,
      sheet,
      fileName: sheet.fileName,
      sheetName,
      label: month ? month.label : sheetName,
      kind,
      month,
      excluded: reason != null,
      excludedReason: reason,
    };
    const arr = byFile.get(sheet.fileName) ?? [];
    arr.push(entry);
    byFile.set(sheet.fileName, arr);
  });

  const groups: FileGroup[] = [];
  for (const [fileName, entries] of byFile) {
    const months = entries
      .filter((e) => e.kind === "month")
      .sort((a, b) => (a.month!.sortIndex - b.month!.sortIndex));
    const summaries = entries.filter((e) => e.kind === "summary");
    const others = entries.filter((e) => e.kind === "other");
    groups.push({
      fileName,
      months,
      summaries,
      others,
      ordered: [...months, ...summaries, ...others],
    });
  }
  return groups;
}

// ─── per-sheet quick stats & column totals ───────────────────────────────────

const RECEIVED_TARGETS = ["rec qty", "received qty", "received", "checked qty", "visual qty", "balloon chkd qty", "checked"];
const REJECTED_TARGETS = ["rej qty", "rejected qty", "rejected", "rej"];

function sumColumn(sheet: RawSheet, col: string | null): number | null {
  if (!col) return null;
  let total = 0;
  let seen = 0;
  for (const row of sheet.rows) {
    const v = row[col];
    if (typeof v === "number" && Number.isFinite(v)) { total += v; seen++; }
  }
  return seen > 0 ? total : null;
}

function firstMatch(columns: string[], targets: string[]): string | null {
  for (const t of targets) {
    const m = findColumn(t, columns);
    if (m) return m;
  }
  return null;
}

export interface QuickStats {
  rows: number;
  cols: number;
  received: number | null;
  rejected: number | null;
  rate: number | null; // rejected / received
}

/** Best-effort per-sheet summary for the overview (consistent with the engine because it sums the same cleaned columns). */
export function quickStats(sheet: RawSheet): QuickStats {
  const received = sumColumn(sheet, firstMatch(sheet.columns, RECEIVED_TARGETS));
  const rejected = sumColumn(sheet, firstMatch(sheet.columns, REJECTED_TARGETS));
  const rate = received && received > 0 && rejected != null ? rejected / received : null;
  return { rows: sheet.rows.length, cols: sheet.columns.length, received, rejected, rate };
}

/** Sum of a specific column's numeric cells (for the reconciliation footer). */
export function columnTotal(sheet: RawSheet, col: string): number | null {
  return sumColumn(sheet, col);
}

/** Indices of sheets whose columns match the given source column (all of them). */
export function findContributingSheets(sheets: RawSheet[], sourceColumn: string | null): number[] {
  if (!sourceColumn) return [];
  const out: number[] = [];
  sheets.forEach((s, i) => {
    if (findColumn(sourceColumn, s.columns)) out.push(i);
  });
  return out;
}

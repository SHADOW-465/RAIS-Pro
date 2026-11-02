// Pure logic behind the shared UI components (KpiTile, StatusBadge, DataTable,
// FiltersPopover). Kept free of React so jest (node env) can cover it.

import type { IconName } from "@/components/editorial/Icon";

export type Status = "ok" | "warning" | "critical" | "neutral";

/** Status is never colour alone: every status carries an icon and a word. */
export const STATUS_META: Record<Status, { icon: IconName; label: string; fg: string; bg: string }> = {
  ok: { icon: "check", label: "OK", fg: "var(--positive)", bg: "var(--positive-weak)" },
  warning: { icon: "alert", label: "Watch", fg: "var(--warning)", bg: "var(--warning-weak)" },
  critical: { icon: "x", label: "Critical", fg: "var(--critical)", bg: "var(--critical-weak)" },
  neutral: { icon: "minus", label: "No data", fg: "var(--text-3)", bg: "var(--surface-2)" },
};

export type Direction = "up" | "down" | "flat";

/** Change versus the last period. `lowerIsBetter` flips which direction is good (rejection rate). */
export function formatDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  opts: { unit?: "pp" | "%"; lowerIsBetter?: boolean; digits?: number } = {},
): { text: string; direction: Direction; good: boolean | null } | null {
  const { unit = "pp", lowerIsBetter = true, digits = 1 } = opts;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const diff = unit === "%"
    ? previous === 0 ? NaN : ((current! - previous!) / Math.abs(previous!)) * 100
    : current! - previous!;
  if (!Number.isFinite(diff)) return null;
  const rounded = Number(diff.toFixed(digits));
  if (rounded === 0) return { text: `0 ${unit === "pp" ? "pp" : "%"}`, direction: "flat", good: null };
  const direction: Direction = rounded > 0 ? "up" : "down";
  const good = lowerIsBetter ? rounded < 0 : rounded > 0;
  const sign = rounded > 0 ? "+" : "−";
  return { text: `${sign}${Math.abs(rounded).toFixed(digits)} ${unit === "pp" ? "pp" : "%"}`, direction, good };
}

/** Renders a KPI value without ever leaking NaN/Infinity to the screen. */
export function formatKpiValue(v: number | string | null | undefined, digits = 1, suffix = ""): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  return Number.isFinite(v) ? `${v.toLocaleString("en-IN", { maximumFractionDigits: digits })}${suffix}` : "—";
}

/** Count shown on the Filters button: values that differ from their default. */
export function activeFilterCount(values: Record<string, unknown>, defaults: Record<string, unknown> = {}): number {
  return Object.entries(values).filter(([k, v]) => {
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return false;
    return v !== defaults[k];
  }).length;
}

export type SortDir = "asc" | "desc";

/** Null-last, numeric-aware comparison; stable for equal keys. */
export function sortRows<T>(rows: readonly T[], get: (r: T) => unknown, dir: SortDir): T[] {
  const m = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, k: get(r) }))
    .sort((a, b) => {
      const an = a.k === null || a.k === undefined || a.k === "";
      const bn = b.k === null || b.k === undefined || b.k === "";
      if (an || bn) return an && bn ? a.i - b.i : an ? 1 : -1;
      const c = typeof a.k === "number" && typeof b.k === "number"
        ? a.k - b.k
        : String(a.k).localeCompare(String(b.k), undefined, { numeric: true, sensitivity: "base" });
      return c ? c * m : a.i - b.i;
    })
    .map((x) => x.r);
}

export function pageSlice<T>(rows: readonly T[], page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { rows: rows.slice(p * pageSize, (p + 1) * pageSize), page: p, pages };
}

/** CSV with quote/newline escaping and formula-injection guard (=,+,-,@ prefixes). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(s) && typeof v === "string") s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

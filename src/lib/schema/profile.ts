// src/lib/schema/profile.ts
import type {
  ColumnProfile,
  ColumnRole,
  FormulaClass,
  ProfilingCell,
  ProfilingTable,
} from "./types";
import { classifyFormula } from "./formula-class";

const DATE_NAME_RE = /\b(date|day|month|year|period|week|quarter)\b/i;
const META_NAME_RE = /s\.?\s*no|sr\.?\s*no|serial|remark|comment|doc\.?\s*no|supersed|effective|page\b|trolley|operator|supervisor/i;
const DERIVED_NAME_RE = /%|percent|\brate\b|\bfpy\b|\byield\b/i;
const MEASURE_NAME_RE = /\bqty\b|quantity|checked|\brec\.?\b|receiv|\baccept|\bacpt\b|\bgood\b|\bhold\b|\brej\b|reject|input|dispatch|produc|balloon|valve|visual|final/i;
const SIZE_NAME_RE = /^\s*\d{1,2}\s*fr\b|^fr\s*\d{1,2}\b|\bsize\b/i;
const SHORT_CODE_RE = /^[A-Z0-9/]{1,6}$/;

function looksSerialDate(nums: number[]): boolean {
  // Mirrors parser.ts looksSerialDate (>=3) to avoid the two date heuristics desyncing.
  return nums.length >= 3 && nums.every((n) => n >= 40000 && n <= 60000);
}

/** Decide a column's value-type from its non-empty sampled cells. */
function columnType(cells: ProfilingCell[], name: string): ColumnProfile["type"] {
  const vals = cells.map((c) => c.value).filter((v) => v !== "" && v != null);
  if (vals.length === 0) return "unknown";
  if (DATE_NAME_RE.test(name)) return "date";
  const nums = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (looksSerialDate(nums)) return "date";
  const isoish = vals.filter((v) => typeof v === "string" && /\d{4}-\d{2}-\d{2}|^\d{1,2}[\/-]\d{1,2}/.test(v));
  if (isoish.length >= vals.length * 0.5) return "date";
  if (nums.length >= Math.max(1, vals.length * 0.5)) return "number";
  return "string";
}

/** Pick the dominant non-"none" formula class across a column's data cells. */
function dominantFormulaClass(
  cells: ProfilingCell[],
  colLetter: string,
  firstDataRow: number,
): FormulaClass | null {
  const tally: Record<string, number> = { "external-link": 0, "vertical-aggregate": 0, "row-derived": 0 };
  const sample: Record<string, FormulaClass> = {};
  cells.forEach((c, idx) => {
    const fc = classifyFormula(c.formula, colLetter, firstDataRow + idx);
    if (fc.kind === "none") return;
    tally[fc.kind] += 1;
    if (!sample[fc.kind]) sample[fc.kind] = fc;
  });
  // Tie-break precedence is intentional and follows Object.keys insertion order:
  // external-link > vertical-aggregate > row-derived. When a column mixes formula
  // kinds equally, prefer treating it as a linked raw value over an ad-hoc derived
  // guess (safer: never silently drops a measure).
  let best: string | null = null;
  for (const k of Object.keys(tally)) {
    if (tally[k] > 0 && (best === null || tally[k] > tally[best])) best = k;
  }
  return best ? sample[best] : null;
}

function classifyRole(
  name: string,
  type: ColumnProfile["type"],
  fclass: FormulaClass | null,
  cardinality: number,
): ColumnRole {
  const u = name.trim().toUpperCase();

  if (type === "date" || DATE_NAME_RE.test(name)) return "dimension-date";
  if (META_NAME_RE.test(name)) return "meta";

  // Derived: a row-wise function of siblings, OR a %/rate/yield by name.
  // NOTE: external-link and vertical-aggregate are deliberately NOT derived —
  // a linked cell is a raw value, an aggregate is a subtotal row artefact.
  if (fclass?.kind === "row-derived") return "derived";
  if (DERIVED_NAME_RE.test(name)) return "derived";

  // Explicit measure words win before the generic short-code → defect rule, so
  // "REJ QTY" / "REC. QTY" stay measures rather than being read as reason codes.
  // Measure-words are checked before the short-code → defect rule so "REJ QTY" /
  // "HOLD QTY" stay measures. A consequence: a BARE one-word reason code that is
  // also a measure-word (e.g. a column literally named "REJ") resolves to measure.
  // In this corpus those are genuinely dispositions, not defect codes; the deferred
  // LLM refinement pass (spec component [B]) disambiguates any true exceptions.
  if (MEASURE_NAME_RE.test(name) && type === "number") return "measure";

  // Defect: a short uppercase reason code carrying numeric tallies.
  if (type === "number" && SHORT_CODE_RE.test(u)) return "defect";

  if (SIZE_NAME_RE.test(name)) return "dimension";

  if (type === "number") return "measure";
  if (type === "string") return cardinality >= 2 && cardinality <= 50 ? "dimension" : "meta";
  return "meta";
}

export function profileColumn(table: ProfilingTable, index: number): ColumnProfile {
  const name = (table.header[index] ?? "").trim();
  const colLetter = table.colLetters[index] ?? "";
  // Keep cells 1:1 with their row index so dominantFormulaClass can reconstruct
  // each cell's true sheet row (firstDataRow + idx). A missing cell becomes empty
  // rather than shifting every subsequent index.
  const cells: ProfilingCell[] = table.rows.map((r) => r[index] ?? { value: "", formula: null });
  const nonEmpty = cells.filter((c) => c.value !== "" && c.value != null);
  const cardinality = new Set(nonEmpty.map((c) => String(c.value))).size;
  const type = columnType(cells, name);
  const formula = dominantFormulaClass(cells, colLetter, table.firstDataRow);
  const role = classifyRole(name, type, formula, cardinality);
  return { name, index, colLetter, role, type, formula };
}

export function profileTable(table: ProfilingTable): { columns: ColumnProfile[] } {
  const columns: ColumnProfile[] = [];
  for (let i = 0; i < table.header.length; i++) {
    if ((table.header[i] ?? "").trim() === "") continue;
    columns.push(profileColumn(table, i));
  }
  return { columns };
}

// src/lib/schema/formula-class.ts
import type { FormulaClass } from "./types";

/**
 * Classify ONE Excel formula by how it relates its cell to the rest of the table.
 *
 * The order matters and encodes the core insight of the profiler:
 *   1. Any "!" or "[n]" means a sheet/workbook reference → external-link.
 *      Such a cell is a LINKED RAW VALUE (e.g. QUANTITY CHECKED pulled from the
 *      daily book), NOT a derived metric — it must never be discarded.
 *   2. A vertical range (B6:B10) → a subtotal/aggregate cell.
 *   3. References to OTHER columns in the SAME row → genuinely derived.
 *
 * @param formula  verbatim formula, with or without a leading "="; null = none
 * @param selfCol  the column letter of the cell being classified (e.g. "G")
 * @param selfRow  the 1-based sheet row of the cell (e.g. 9)
 */
export function classifyFormula(
  formula: string | null,
  selfCol: string,
  selfRow: number,
): FormulaClass {
  if (formula == null) return { kind: "none" };
  let f = formula.trim();
  if (f.startsWith("=")) f = f.slice(1);
  if (f === "") return { kind: "none" };

  // 1. Sheet/workbook reference. In Excel, "!" only ever denotes a sheet ref,
  //    and "[n]" an external workbook — neither appears in plain arithmetic.
  if (f.includes("!") || /\[\d+\]/.test(f)) {
    const m = f.match(/(?:\[\d+\])?(?:'[^']*'|[A-Za-z0-9_ ]+)!\$?[A-Z]{1,3}\$?\d+/);
    return { kind: "external-link", ref: m ? m[0] : f };
  }

  // 2. Vertical aggregate range, e.g. SUM(B6:B10).
  const range = f.match(/\$?[A-Z]{1,3}\$?\d+\s*:\s*\$?[A-Z]{1,3}\$?\d+/);
  if (range) return { kind: "vertical-aggregate", range: range[0] };

  // 3. Same-row references to OTHER columns → derived.
  const refRe = /\$?([A-Z]{1,3})\$?(\d+)/g;
  const refs = new Set<string>();
  let mm: RegExpExecArray | null;
  while ((mm = refRe.exec(f)) !== null) {
    const col = mm[1];
    const row = Number(mm[2]);
    if (row === selfRow && col !== selfCol) refs.add(col);
  }
  if (refs.size > 0) return { kind: "row-derived", refs: [...refs] };

  return { kind: "none" };
}

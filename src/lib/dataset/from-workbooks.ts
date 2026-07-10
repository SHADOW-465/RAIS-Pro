import { buildProfilingTables } from "@/lib/schema/from-workbook";
import { profileTable } from "@/lib/schema/profile";
import { computeSignature, normalizeName } from "@/lib/schema/signature";
import { groupIntoDatasets } from "./registry";
import type { Dataset, DatasetRow, ProfiledTableInput } from "./types";
import type { StageAlias } from "@/lib/store/types";

export interface WorkbookInput {
  fileName: string;
  data: ArrayBuffer | Buffer;
}

export interface DatasetsWithRows {
  datasets: Dataset[];
  rows: DatasetRow[];
}

/** Build a collision-safe key per non-meta column: if two columns normalize to the
 * same name within this table (e.g. differing only by case/whitespace), suffix
 * the later ones by column letter so neither's values are silently overwritten.
 * This does NOT change Dataset.columns/the schema signature — only how row
 * VALUES are keyed for extraction. */
function rowValueKeys(nonMetaCols: { name: string; colLetter: string }[]): Map<number, string> {
  const seen = new Map<string, number>(); // normalized name -> count seen so far
  const keys = new Map<number, string>(); // column array index -> extraction key
  nonMetaCols.forEach((col, i) => {
    const base = normalizeName(col.name);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    keys.set(i, count === 0 ? base : `${base} (${col.colLetter})`);
  });
  return keys;
}

/** Same grouping as datasetsFromWorkbooks, but also extracts every non-meta
 *  column's value for every row (uncapped — see buildProfilingTables maxRows),
 *  tagged with the Dataset id they belong to. */
export function datasetsWithRowsFromWorkbooks(
  files: WorkbookInput[],
  stageAliases: Record<string, StageAlias> = {},
): DatasetsWithRows {
  const inputs: (ProfiledTableInput & { rowsRaw: import("@/lib/schema/types").ProfilingCell[][] })[] = [];

  for (const f of files) {
    for (const table of buildProfilingTables(f.data, f.fileName, { maxRows: Number.MAX_SAFE_INTEGER })) {
      const { columns } = profileTable(table);
      const signature = computeSignature(columns);
      inputs.push({
        fileName: f.fileName,
        sheetName: table.sheetName,
        signature,
        columns,
        rowCount: table.rows.length,
        rowsRaw: table.rows,
      });
    }
  }

  const datasets = groupIntoDatasets(inputs, stageAliases);

  const idFor = new Map<string, string>();
  for (const d of datasets) for (const s of d.sources) idFor.set(`${s.fileName}::${s.sheetName}`, d.id);

  const rows: DatasetRow[] = [];
  for (const inp of inputs) {
    const datasetId = idFor.get(`${inp.fileName}::${inp.sheetName}`);
    if (!datasetId) continue; // should not happen; grouping covers every input
    const nonMetaCols = inp.columns.filter((c) => c.role !== "meta");
    const keys = rowValueKeys(nonMetaCols);
    inp.rowsRaw.forEach((cells, rowIndex) => {
      const values: Record<string, string | number | null> = {};
      nonMetaCols.forEach((col, i) => {
        const raw = cells[col.index]?.value;
        // Key by the same normalized name used in Dataset.columns (computeSignature
        // lowercases/trims), disambiguated by column letter on within-table collisions
        // so a same-normalized-name later column never silently overwrites an earlier one.
        values[keys.get(i)!] = raw === "" || raw === undefined ? null : (raw as string | number);
      });
      const allEmpty = Object.values(values).every((v) => v === null);
      if (allEmpty) return; // skip fully-blank rows (e.g. trailing sheet padding)
      rows.push({ datasetId, fileName: inp.fileName, sheetName: inp.sheetName, rowIndex, values });
    });
  }

  return { datasets, rows };
}

/** End-to-end: raw workbooks → profiled tables → datasets grouped by signature.
 *  The only dataset file that (transitively) touches xlsx. */
export function datasetsFromWorkbooks(
  files: WorkbookInput[],
  stageAliases: Record<string, StageAlias> = {},
): Dataset[] {
  return datasetsWithRowsFromWorkbooks(files, stageAliases).datasets;
}

import { buildProfilingTables } from "@/lib/schema/from-workbook";
import { profileTable } from "@/lib/schema/profile";
import { computeSignature, normalizeName } from "@/lib/schema/signature";
import { groupIntoDatasets } from "./registry";
import type { Dataset, DatasetRow, ProfiledTableInput } from "./types";

export interface WorkbookInput {
  fileName: string;
  data: ArrayBuffer | Buffer;
}

export interface DatasetsWithRows {
  datasets: Dataset[];
  rows: DatasetRow[];
}

/** Same grouping as datasetsFromWorkbooks, but also extracts every non-meta
 *  column's value for every row (uncapped — see buildProfilingTables maxRows),
 *  tagged with the Dataset id they belong to. */
export function datasetsWithRowsFromWorkbooks(files: WorkbookInput[]): DatasetsWithRows {
  const inputs: (ProfiledTableInput & { rowsRaw: import("@/lib/schema/types").ProfilingCell[][] })[] = [];

  for (const f of files) {
    for (const table of buildProfilingTables(f.data, f.fileName, { maxRows: 5000 })) {
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

  const datasets = groupIntoDatasets(inputs);

  const idFor = new Map<string, string>();
  for (const d of datasets) for (const s of d.sources) idFor.set(`${s.fileName}::${s.sheetName}`, d.id);

  const rows: DatasetRow[] = [];
  for (const inp of inputs) {
    const datasetId = idFor.get(`${inp.fileName}::${inp.sheetName}`);
    if (!datasetId) continue; // should not happen; grouping covers every input
    const nonMetaCols = inp.columns.filter((c) => c.role !== "meta");
    inp.rowsRaw.forEach((cells, rowIndex) => {
      const values: Record<string, string | number | null> = {};
      for (const col of nonMetaCols) {
        const raw = cells[col.index]?.value;
        // Key by the same normalized name used in Dataset.columns (computeSignature
        // lowercases/trims), so a row's values line up with its dataset's column list.
        values[normalizeName(col.name)] = raw === "" || raw === undefined ? null : (raw as string | number);
      }
      const allEmpty = Object.values(values).every((v) => v === null);
      if (allEmpty) return; // skip fully-blank rows (e.g. trailing sheet padding)
      rows.push({ datasetId, fileName: inp.fileName, sheetName: inp.sheetName, rowIndex, values });
    });
  }

  return { datasets, rows };
}

/** End-to-end: raw workbooks → profiled tables → datasets grouped by signature.
 *  The only dataset file that (transitively) touches xlsx. */
export function datasetsFromWorkbooks(files: WorkbookInput[]): Dataset[] {
  return datasetsWithRowsFromWorkbooks(files).datasets;
}

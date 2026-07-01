// src/lib/dataset/from-workbooks.ts
import { buildProfilingTables } from "@/lib/schema/from-workbook";
import { profileTable } from "@/lib/schema/profile";
import { computeSignature } from "@/lib/schema/signature";
import { groupIntoDatasets } from "./registry";
import type { Dataset, ProfiledTableInput } from "./types";

export interface WorkbookInput {
  fileName: string;
  data: ArrayBuffer | Buffer;
}

/** End-to-end: raw workbooks → profiled tables → datasets grouped by signature.
 *  The only dataset file that (transitively) touches xlsx. */
export function datasetsFromWorkbooks(files: WorkbookInput[]): Dataset[] {
  const inputs: ProfiledTableInput[] = [];
  for (const f of files) {
    for (const table of buildProfilingTables(f.data, f.fileName)) {
      const { columns } = profileTable(table);
      const signature = computeSignature(columns);
      inputs.push({
        fileName: f.fileName,
        sheetName: table.sheetName,
        signature,
        columns,
        rowCount: table.rows.length,
      });
    }
  }
  return groupIntoDatasets(inputs);
}

import type { DatasetRow } from "./types";

export interface RowStore {
  /** Replace-by-key upsert: same (datasetId, fileName, sheetName, rowIndex) replaces in place. */
  upsert(rows: DatasetRow[]): Promise<void>;
  /** All rows for one dataset, in insertion-stable (fileName, sheetName, rowIndex) order. */
  forDataset(datasetId: string): Promise<DatasetRow[]>;
  clear(): Promise<void>;
}

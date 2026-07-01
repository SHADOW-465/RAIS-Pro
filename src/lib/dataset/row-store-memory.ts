import type { DatasetRow } from "./types";
import type { RowStore } from "./row-store";

function key(r: Pick<DatasetRow, "datasetId" | "fileName" | "sheetName" | "rowIndex">): string {
  return `${r.datasetId}::${r.fileName}::${r.sheetName}::${r.rowIndex}`;
}

export class MemoryRowStore implements RowStore {
  private byKey = new Map<string, DatasetRow>();

  async upsert(rows: DatasetRow[]): Promise<void> {
    for (const r of rows) this.byKey.set(key(r), r);
  }

  async forDataset(datasetId: string): Promise<DatasetRow[]> {
    return [...this.byKey.values()]
      .filter((r) => r.datasetId === datasetId)
      .sort(
        (a, b) =>
          a.fileName.localeCompare(b.fileName) ||
          a.sheetName.localeCompare(b.sheetName) ||
          a.rowIndex - b.rowIndex,
      );
  }

  async clear(): Promise<void> {
    this.byKey.clear();
  }
}

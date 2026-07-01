import type { Dataset } from "./types";
import type { DatasetStore } from "./store";

export class MemoryDatasetStore implements DatasetStore {
  private byId = new Map<string, Dataset>();

  async upsert(datasets: Dataset[]): Promise<void> {
    for (const d of datasets) this.byId.set(d.id, d);
  }

  async list(): Promise<Dataset[]> {
    return [...this.byId.values()].sort(
      (a, b) => b.totalRows - a.totalRows || a.title.localeCompare(b.title),
    );
  }

  async clear(): Promise<void> {
    this.byId.clear();
  }
}

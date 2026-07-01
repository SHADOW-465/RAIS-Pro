import type { Dataset } from "./types";
import type { DatasetStore } from "./store";
import { sortDatasets } from "./store";

export class MemoryDatasetStore implements DatasetStore {
  private byId = new Map<string, Dataset>();

  async upsert(datasets: Dataset[]): Promise<void> {
    for (const d of datasets) this.byId.set(d.id, d);
  }

  async list(): Promise<Dataset[]> {
    return sortDatasets([...this.byId.values()]);
  }

  async clear(): Promise<void> {
    this.byId.clear();
  }
}

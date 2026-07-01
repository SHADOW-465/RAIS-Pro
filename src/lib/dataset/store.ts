// src/lib/dataset/store.ts
// Persistence interface for Datasets — mirrors src/lib/store/types.ts's
// EventStore pattern (interface; memory + supabase adapters implement it).
import type { Dataset } from "./types";

export interface DatasetStore {
  /** Insert or replace by id (a re-ingest of the same signature updates in place). */
  upsert(datasets: Dataset[]): Promise<void>;
  list(): Promise<Dataset[]>;
  /** Remove all — mirrors the app's existing "clear data" affordance. */
  clear(): Promise<void>;
}

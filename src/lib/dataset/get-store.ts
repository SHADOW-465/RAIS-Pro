/* eslint-disable @typescript-eslint/no-require-imports */
import type { DatasetStore } from "./store";
import { MemoryDatasetStore } from "./store-memory";
import { shouldUseSupabase } from "@/lib/store";

const g = globalThis as unknown as { __datasetStore?: DatasetStore };

export function getDatasetStore(): DatasetStore {
  if (g.__datasetStore) return g.__datasetStore;
  if (shouldUseSupabase()) {
    const { SupabaseDatasetStore } = require("./store-supabase") as typeof import("./store-supabase");
    g.__datasetStore = new SupabaseDatasetStore();
  } else {
    g.__datasetStore = new MemoryDatasetStore();
  }
  return g.__datasetStore;
}

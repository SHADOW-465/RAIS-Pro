/* eslint-disable @typescript-eslint/no-require-imports */
import type { DatasetStore } from "./store";
import { MemoryDatasetStore } from "./store-memory";

const g = globalThis as unknown as { __datasetStore?: DatasetStore };

/** Mirrors src/lib/store/index.ts's shouldUseSupabase() selector. */
function shouldUseSupabase(): boolean {
  if ((process.env.MOID_STORE || "").toLowerCase() === "memory") return false;
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

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

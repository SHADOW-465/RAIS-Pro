/* eslint-disable @typescript-eslint/no-require-imports */
import { shouldUseSupabase } from "@/lib/store";
import type { RowStore } from "./row-store";
import { MemoryRowStore } from "./row-store-memory";

const g = globalThis as unknown as { __rowStore?: RowStore };

export function getRowStore(): RowStore {
  if (g.__rowStore) return g.__rowStore;
  if (shouldUseSupabase()) {
    const { SupabaseRowStore } = require("./row-store-supabase") as typeof import("./row-store-supabase");
    g.__rowStore = new SupabaseRowStore();
  } else {
    g.__rowStore = new MemoryRowStore();
  }
  return g.__rowStore;
}

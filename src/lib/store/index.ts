// Store selector (MOID-SPEC §11/§13).
// Supabase adapter when env is configured (on-prem self-host or hosted);
// otherwise a process-singleton memory store — persists across requests within
// one running server, which is all the demo needs.

import {
  MemoryEventStore,
  MemoryFindingStore,
  MemoryRulebookStore,
} from "./memory";
import type { EventStore, FindingStore, RulebookStore } from "./types";

export interface Stores {
  events: EventStore;
  findings: FindingStore;
  rulebook: RulebookStore;
  backend: "supabase" | "memory";
}

// Module-level singletons so memory state survives across API calls in a
// single dev/server process.
const g = globalThis as unknown as { __moidStores?: Stores };

/**
 * Memory is the default — it always works (in-process singleton, no network),
 * which is what the demo and local dev need. Supabase is OPT-IN via
 * `MOID_STORE=supabase`, so merely having SUPABASE_* env vars present (e.g. for
 * other features) never silently routes the ledger at an unreachable project
 * and fails Save with "fetch failed". Requires the migration applied + the
 * project reachable.
 */
function useSupabase(): boolean {
  if ((process.env.MOID_STORE || "").toLowerCase() !== "supabase") return false;
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getStores(): Stores {
  if (g.__moidStores) return g.__moidStores;

  if (useSupabase()) {
    // Lazy require so the demo doesn't need supabase installed/typed to run memory mode.
    const {
      SupabaseEventStore,
      SupabaseRulebookStore,
      SupabaseFindingStore,
    } = require("./supabase") as typeof import("./supabase");
    const rulebook = new SupabaseRulebookStore();
    g.__moidStores = {
      events: new SupabaseEventStore(),
      rulebook,
      findings: new SupabaseFindingStore(rulebook),
      backend: "supabase",
    };
  } else {
    const rulebook = new MemoryRulebookStore();
    g.__moidStores = {
      events: new MemoryEventStore(),
      rulebook,
      findings: new MemoryFindingStore(rulebook),
      backend: "memory",
    };
  }
  return g.__moidStores;
}

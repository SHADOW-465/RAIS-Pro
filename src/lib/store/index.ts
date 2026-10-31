/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
// Store selector (MOID-SPEC §11/§13).
// Supabase adapter when env is configured (on-prem self-host or hosted);
// otherwise a process-singleton memory store — persists across requests within
// one running server, which is all the demo needs.

import {
  MemoryEventStore,
  MemoryFindingStore,
  MemoryRulebookStore,
  MemoryRegistryStore,
} from "./memory";
import type { EventStore, FindingStore, RulebookStore, RegistryStore } from "./types";

export interface Stores {
  events: EventStore;
  findings: FindingStore;
  rulebook: RulebookStore;
  registries: RegistryStore;
  backend: "supabase" | "memory";
}

// Module-level singletons so memory state survives across API calls in a
// single dev/server process.
const g = globalThis as unknown as { __moidStores?: Stores };

/**
 * Durable by default: use Supabase whenever a project URL + a key are present.
 * `MOID_STORE=memory` forces the in-RAM store (tests, throwaway dev). Setting
 * `MOID_STORE=supabase` also works but is no longer required.
 */
export function shouldUseSupabase(): boolean {
  if ((process.env.MOID_STORE || "").toLowerCase() === "memory") return false;
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getStores(): Stores {
  if (g.__moidStores) return g.__moidStores;

  if (shouldUseSupabase()) {
    // Lazy require so the demo doesn't need supabase installed/typed to run memory mode.
    const {
      SupabaseEventStore,
      SupabaseRulebookStore,
      SupabaseFindingStore,
      SupabaseRegistryStore,
    } = require("./supabase") as typeof import("./supabase");
    const rulebook = new SupabaseRulebookStore();
    const events = new SupabaseEventStore();
    g.__moidStores = {
      events,
      rulebook,
      findings: new SupabaseFindingStore(rulebook),
      registries: new SupabaseRegistryStore(),
      backend: "supabase",
    };
  } else {
    const rulebook = new MemoryRulebookStore();
    const events = new MemoryEventStore();
    g.__moidStores = {
      events,
      rulebook,
      findings: new MemoryFindingStore(rulebook),
      registries: new MemoryRegistryStore(),
      backend: "memory",
    };
  }
  return g.__moidStores;
}

// getActiveRegistryRow is gone (MOD v2 Phase 5): the catalog comes from
// getModStore().catalogFor(); RegistryStore remains ONLY so migrate:mods can
// read legacy presets.

// Disk auto-seeding was deleted with the legacy parsers (MOD v2 Phase 5) —
// the MOD pipeline (staging upload) is the only ingestion path.

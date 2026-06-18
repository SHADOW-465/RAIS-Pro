/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
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
import { parseWorkbookBuffer } from "../parser";
import { classifyRejectionSheets, toISODate } from "../ingest/from-rejection-sheets";
import { emitMany } from "../ingest/emit";

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
    } = require("./supabase") as typeof import("./supabase");
    const rulebook = new SupabaseRulebookStore();
    const events = new SupabaseEventStore();
    g.__moidStores = {
      events,
      rulebook,
      findings: new SupabaseFindingStore(rulebook),
      backend: "supabase",
    };
    seedStore(events);
  } else {
    const rulebook = new MemoryRulebookStore();
    const events = new MemoryEventStore();
    g.__moidStores = {
      events,
      rulebook,
      findings: new MemoryFindingStore(rulebook),
      backend: "memory",
    };
    seedStore(events);
  }
  return g.__moidStores;
}

import { seedFromDisk } from "./seed";

function seedStore(eventsStore: EventStore) {
  if (typeof window !== "undefined") return;
  void seedFromDisk(eventsStore).catch((e) => console.error("seed failed:", e));
}

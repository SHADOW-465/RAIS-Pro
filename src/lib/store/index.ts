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
  backend: "supabase" | "postgres" | "memory";
}

// Module-level singletons so memory state survives across API calls in a
// single dev/server process.
const g = globalThis as unknown as { __moidStores?: Stores };

/**
 * Durable by default: use the DB-backed stores whenever a database is
 * configured — either on-prem Postgres (`DATABASE_URL`) or hosted Supabase
 * (project URL + a key). The `Supabase*Store` classes talk to whichever the
 * server client resolves to. `MOID_STORE=memory` forces the in-RAM store
 * (tests, throwaway dev).
 */
export function usesDatabase(): boolean {
  if ((process.env.MOID_STORE || "").toLowerCase() === "memory") return false;
  if (process.env.DATABASE_URL) return true;
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** @deprecated kept for backwards compat — prefer {@link usesDatabase}. */
export function shouldUseSupabase(): boolean {
  return usesDatabase();
}

export function getStores(): Stores {
  if (g.__moidStores) return g.__moidStores;

  if (usesDatabase()) {
    // Lazy require so the demo doesn't need the DB adapter typed to run memory mode.
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
      backend: process.env.DATABASE_URL ? "postgres" : "supabase",
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

// Auto-seeding from the ANALYTICAL DATA/ folder is OFF by default. The app
// starts BLANK and shows only what users upload (/staging) or key in
// (/data-entry) — no courtesy demo data. Set MOID_AUTOSEED=1 to opt back in for
// local dev/demos.
function seedStore(eventsStore: EventStore) {
  if (typeof window !== "undefined") return;
  if (process.env.MOID_AUTOSEED !== "1") return;
  void seedFromDisk(eventsStore).catch((e) => console.error("seed failed:", e));
}

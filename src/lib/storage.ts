// The one place that reads or writes localStorage / sessionStorage.
//
// Why: a value saved by yesterday's build and read by today's code is how a
// browser ends up "stuck on the old version" until site data is cleared. So
// every value here
//
//   - lives under a namespaced key        `moid:<name>`
//   - is wrapped                          { v, buildSchemaVersion, data }
//   - is checked with a Zod schema on read
//
// and anything that is stale (older STORAGE_SCHEMA_VERSION), malformed, or no
// longer matches its schema is DISCARDED, never returned. Bump
// STORAGE_SCHEMA_VERSION when a stored shape changes incompatibly.
//
// Data written by the pre-wrapper code (`legacyKeys`: moid_* / rais_* raw JSON
// or plain strings) is adopted once if it still validates, re-saved wrapped,
// and the old key removed. Invalid legacy data is dropped.
//
// Nothing here throws: SSR, private mode, blocked storage and a full quota all
// read as "nothing stored" / "not saved" (`set` returns false).

import { z } from "zod";

export const STORAGE_NAMESPACE = "moid";
/** Envelope format. Changing it invalidates every stored value. */
export const ENVELOPE_VERSION = 1;
/** Shape generation of the stored data. Bump on an incompatible change. */
export const STORAGE_SCHEMA_VERSION = 1;

export type StorageArea = "local" | "session";

const envelopeSchema = z.object({
  v: z.number(),
  buildSchemaVersion: z.number(),
  data: z.unknown(),
});

export const storageKey = (name: string): string => `${STORAGE_NAMESPACE}:${name}`;

function area(which: StorageArea): Storage | null {
  try {
    const s = which === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    return s ?? null;
  } catch {
    return null; // blocked (cookies off) or SSR
  }
}

/** A parsed envelope that this build still trusts, or null. */
function openEnvelope(raw: string, version: number): { data: unknown } | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const env = envelopeSchema.safeParse(json);
  if (!env.success) return null;
  if (env.data.v !== ENVELOPE_VERSION || env.data.buildSchemaVersion !== version) return null;
  return { data: env.data.data };
}

/** Pre-wrapper values were raw JSON, or a bare string (persona id, "true"). */
function parseLegacy(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export interface Slot<T> {
  /** The full storage key, `moid:<name>`. */
  readonly key: string;
  /** The stored value; undefined when absent, stale or invalid (and then removed). */
  get(): T | undefined;
  /** False when the browser would not take it. */
  set(value: T): boolean;
  remove(): void;
}

/** What a slot needs from a store; lets tests and callers inject their own. */
export type SlotStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

export interface SlotOptions<T> {
  /** Short stable name, e.g. "capa-actions". Dynamic parts go after a colon. */
  name: string;
  schema: z.ZodType<T>;
  /** Default "local". */
  area?: StorageArea;
  /** Use this store instead of the browser's (null = no storage available). */
  store?: SlotStore | null;
  /** Keys the old code used for this value; adopted once, then removed. */
  legacyKeys?: string[];
}

export function slot<T>(opts: SlotOptions<T>): Slot<T> {
  const key = storageKey(opts.name);
  const which = opts.area ?? "local";
  const version = STORAGE_SCHEMA_VERSION;
  const legacy = opts.legacyKeys ?? [];

  const open = (): SlotStore | null => ("store" in opts ? (opts.store ?? null) : area(which));

  function write(s: SlotStore, value: T): boolean {
    try {
      s.setItem(key, JSON.stringify({ v: ENVELOPE_VERSION, buildSchemaVersion: version, data: value }));
      return true;
    } catch {
      return false; // quota or blocked
    }
  }

  function dropLegacy(s: SlotStore): void {
    for (const k of legacy) {
      try {
        s.removeItem?.(k);
      } catch {
        /* nothing to do */
      }
    }
  }

  return {
    key,
    get() {
      const s = open();
      if (!s) return undefined;
      try {
        const raw = s.getItem(key);
        if (raw != null) {
          const opened = openEnvelope(raw, version);
          const parsed = opened ? opts.schema.safeParse(opened.data) : null;
          if (parsed?.success) return parsed.data;
          s.removeItem?.(key); // stale build, damaged JSON, or a shape this code no longer accepts
          return undefined;
        }
        for (const k of legacy) {
          const old = s.getItem(k);
          if (old == null) continue;
          const parsed = opts.schema.safeParse(parseLegacy(old));
          if (parsed.success) {
            write(s, parsed.data);
            dropLegacy(s);
            return parsed.data;
          }
          s.removeItem?.(k);
        }
      } catch {
        /* unreadable storage reads as empty */
      }
      return undefined;
    },
    set(value) {
      const s = open();
      if (!s) return false;
      const ok = write(s, value);
      if (ok) dropLegacy(s); // a stale legacy copy must never resurface after this save
      return ok;
    },
    remove() {
      const s = open();
      if (!s) return;
      try {
        s.removeItem?.(key);
      } catch {
        /* nothing to do */
      }
      dropLegacy(s);
    },
  };
}

/**
 * Remove every `moid:*` value in this browser that the current build would
 * refuse (stale schema version, damaged, not an envelope). Run once at boot so
 * orphans left by renamed or retired slots do not pile up. Returns the count.
 */
export function sweepStaleStorage(): number {
  let removed = 0;
  for (const which of ["local", "session"] as StorageArea[]) {
    const s = area(which);
    if (!s) continue;
    try {
      const keys: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(`${STORAGE_NAMESPACE}:`)) keys.push(k);
      }
      for (const k of keys) {
        const raw = s.getItem(k);
        if (raw == null || openEnvelope(raw, STORAGE_SCHEMA_VERSION) === null) {
          s.removeItem(k);
          removed++;
        }
      }
    } catch {
      /* storage went away mid-sweep */
    }
  }
  return removed;
}

/**
 * True once this browser has confirmed `name` with the server.
 * The local copy of the data itself is a different slot and is kept.
 */
export function importedMarker(name: string): Slot<true> {
  return slot({ name: `imported:${name}`, schema: z.literal(true) });
}

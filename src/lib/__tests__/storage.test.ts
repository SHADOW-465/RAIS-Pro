import { z } from "zod";
import { ENVELOPE_VERSION, STORAGE_SCHEMA_VERSION, slot, sweepStaleStorage } from "../storage";

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const g = globalThis as unknown as { localStorage: MemoryStorage; sessionStorage: MemoryStorage };
beforeEach(() => {
  g.localStorage = new MemoryStorage();
  g.sessionStorage = new MemoryStorage();
});

const nums = z.array(z.number());
const raw = (k: string) => g.localStorage.getItem(k);
const env = (data: unknown, over: Record<string, unknown> = {}) =>
  JSON.stringify({ v: ENVELOPE_VERSION, buildSchemaVersion: STORAGE_SCHEMA_VERSION, data, ...over });

test("round-trips under a namespaced, wrapped key", () => {
  const s = slot({ name: "t", schema: nums });
  expect(s.get()).toBeUndefined();
  expect(s.set([1, 2])).toBe(true);
  expect(s.get()).toEqual([1, 2]);
  expect(JSON.parse(raw("moid:t")!)).toEqual({ v: ENVELOPE_VERSION, buildSchemaVersion: STORAGE_SCHEMA_VERSION, data: [1, 2] });
});

test("discards values from another schema generation, damaged JSON and wrong shapes", () => {
  const s = slot({ name: "t", schema: nums });
  g.localStorage.setItem("moid:t", env([1], { buildSchemaVersion: STORAGE_SCHEMA_VERSION - 1 }));
  expect(s.get()).toBeUndefined();
  expect(raw("moid:t")).toBeNull();
  g.localStorage.setItem("moid:t", "{not json");
  expect(s.get()).toBeUndefined();
  expect(raw("moid:t")).toBeNull();
  g.localStorage.setItem("moid:t", env(["x"]));
  expect(s.get()).toBeUndefined();
  g.localStorage.setItem("moid:t", JSON.stringify([1, 2])); // un-wrapped
  expect(s.get()).toBeUndefined();
});

test("adopts a still-valid legacy value once, then removes the old key", () => {
  const s = slot({ name: "t", schema: nums, legacyKeys: ["moid_old", "rais_older"] });
  g.localStorage.setItem("rais_older", "[3,4]");
  expect(s.get()).toEqual([3, 4]);
  expect(raw("rais_older")).toBeNull();
  expect(JSON.parse(raw("moid:t")!).data).toEqual([3, 4]);
  expect(s.get()).toEqual([3, 4]);
});

test("a legacy value that no longer validates is dropped, not returned", () => {
  const s = slot({ name: "t", schema: nums, legacyKeys: ["moid_old"] });
  g.localStorage.setItem("moid_old", '{"a":1}');
  expect(s.get()).toBeUndefined();
  expect(raw("moid_old")).toBeNull();
});

test("legacy bare strings (persona id, 'true') are adopted", () => {
  const str = slot({ name: "p", schema: z.enum(["gm", "qm"]), legacyKeys: ["moid_persona"] });
  g.localStorage.setItem("moid_persona", "qm");
  expect(str.get()).toBe("qm");
  const bool = slot({ name: "b", schema: z.boolean(), legacyKeys: ["rais_flag"] });
  g.localStorage.setItem("rais_flag", "true");
  expect(bool.get()).toBe(true);
});

test("set and remove clear the legacy copy so it cannot resurface", () => {
  const s = slot({ name: "t", schema: nums, legacyKeys: ["moid_old"] });
  g.localStorage.setItem("moid_old", "[9]");
  s.set([1]);
  expect(raw("moid_old")).toBeNull();
  g.localStorage.setItem("moid_old", "[9]");
  s.remove();
  expect(s.get()).toBeUndefined();
});

test("session slots use sessionStorage", () => {
  const s = slot({ name: "x", schema: z.string(), area: "session" });
  s.set("a");
  expect(g.sessionStorage.getItem("moid:x")).not.toBeNull();
  expect(raw("moid:x")).toBeNull();
});

test("never throws when storage is missing or full", () => {
  const s = slot({ name: "t", schema: nums });
  g.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  expect(s.set([1])).toBe(false);
  (g as unknown as { localStorage: unknown }).localStorage = undefined;
  expect(s.get()).toBeUndefined();
  expect(s.set([1])).toBe(false);
});

test("sweepStaleStorage removes only moid:* values this build would refuse", () => {
  slot({ name: "keep", schema: nums }).set([1]);
  g.localStorage.setItem("moid:old", env([1], { buildSchemaVersion: 0 }));
  g.localStorage.setItem("moid:junk", "nope");
  g.localStorage.setItem("moid_legacy", "[1]");
  g.localStorage.setItem("other", "x");
  expect(sweepStaleStorage()).toBe(2);
  expect(raw("moid:keep")).not.toBeNull();
  expect(raw("moid_legacy")).toBe("[1]");
  expect(raw("other")).toBe("x");
});

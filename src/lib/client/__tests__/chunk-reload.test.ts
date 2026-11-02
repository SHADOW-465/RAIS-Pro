import { RELOAD_GUARD_MS, isChunkLoadError, reloadOnceForChunkError } from "../chunk-reload";

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as unknown as { sessionStorage: MemoryStorage };
beforeEach(() => { g.sessionStorage = new MemoryStorage(); });

const chunk = Object.assign(new Error("Loading chunk 123 failed."), { name: "ChunkLoadError" });

test("recognises chunk / dynamic-import failures and nothing else", () => {
  expect(isChunkLoadError(chunk)).toBe(true);
  expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/_next/static/a.js"))).toBe(true);
  expect(isChunkLoadError("ChunkLoadError: boom")).toBe(true);
  expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  expect(isChunkLoadError(null)).toBe(false);
});

test("reloads once, then falls back to the retry UI until the guard window passes", () => {
  const reload = jest.fn();
  expect(reloadOnceForChunkError(chunk, 1_000, reload)).toBe(true);
  expect(reloadOnceForChunkError(chunk, 1_500, reload)).toBe(false);
  expect(reloadOnceForChunkError(chunk, 1_000 + RELOAD_GUARD_MS - 1, reload)).toBe(false);
  expect(reload).toHaveBeenCalledTimes(1);
  // a much later deploy can reload again
  expect(reloadOnceForChunkError(chunk, 1_000 + RELOAD_GUARD_MS, reload)).toBe(true);
  expect(reload).toHaveBeenCalledTimes(2);
});

test("an ordinary error never reloads, and unsavable guard never loops", () => {
  const reload = jest.fn();
  expect(reloadOnceForChunkError(new Error("nope"), 1, reload)).toBe(false);
  g.sessionStorage.setItem = () => { throw new Error("blocked"); };
  expect(reloadOnceForChunkError(chunk, 1, reload)).toBe(false);
  expect(reload).not.toHaveBeenCalled();
});

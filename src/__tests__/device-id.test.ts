// src/__tests__/device-id.test.ts
import { getDeviceId } from "@/lib/device-id";

// Lightweight in-memory localStorage mock so this test runs under the
// default Node jest environment (no jsdom required).
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

describe("getDeviceId", () => {
  beforeEach(() => {
    store.clear();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = localStorageMock;
    (globalThis as any).crypto ??= { randomUUID: () => "00000000-0000-0000-0000-000000000000" };
  });

  afterEach(() => {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
  });

  it("returns empty string in server context (no window)", () => {
    delete (globalThis as any).window;
    expect(getDeviceId()).toBe("");
  });

  it("generates a UUID on first call", () => {
    const id = getDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns the same UUID on subsequent calls", () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(first).toBe(second);
  });
});

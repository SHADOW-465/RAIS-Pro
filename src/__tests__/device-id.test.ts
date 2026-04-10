// src/__tests__/device-id.test.ts
import { getDeviceId } from "@/lib/device-id";

describe("getDeviceId", () => {
  beforeEach(() => localStorage.clear());

  it("returns empty string in server context (no window)", () => {
    const originalWindow = global.window;
    // @ts-expect-error intentional
    delete global.window;
    expect(getDeviceId()).toBe("");
    global.window = originalWindow;
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

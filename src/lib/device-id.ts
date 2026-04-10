// src/lib/device-id.ts

const KEY = "rais_device_id";

/**
 * Returns the device ID for this browser.
 * Generates and persists a UUID on first call.
 * Safe to call server-side — returns "" if window is unavailable.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

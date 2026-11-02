// Shift edit windows — when an operator may create/edit without GM grant.
// Default plant window: Day Shift 08:00–20:00 Asia/Kolkata.

import { z } from "zod";
import { slot } from "@/lib/storage";
import { pushShared } from "@/lib/shared-state/push";

export type ShiftWindow = { start: string; end: string }; // "HH:MM" 24h

export type ShiftWindowConfig = {
  timezone: string;
  windows: Record<string, ShiftWindow>;
};

const shiftWindowSlot = slot({
  name: "shift-windows",
  schema: z.object({
    timezone: z.string().optional(),
    windows: z.record(z.string(), z.object({ start: z.string(), end: z.string() })),
  }) as unknown as z.ZodType<ShiftWindowConfig>,
  legacyKeys: ["moid_shift_windows"],
});

export const DEFAULT_SHIFT_WINDOWS: ShiftWindowConfig = {
  timezone: "Asia/Kolkata",
  windows: {
    "Day Shift": { start: "08:00", end: "20:00" },
  },
};

/** Parse "HH:MM" → minutes from midnight. */
export function parseHm(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return NaN;
  return h * 60 + min;
}

/**
 * Local wall-clock minutes in `timezone` for `at`.
 * Uses Intl so we don't depend on process TZ.
 */
export function localMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Whether `at` falls inside the window for `shiftLabel`.
 * End is exclusive (20:00 means last editable moment is 19:59).
 * Unknown shift labels → closed (must request grant).
 * Overnight windows (start > end) wrap midnight.
 */
export function isWithinShiftWindow(
  shiftLabel: string,
  at: Date = new Date(),
  config: ShiftWindowConfig = DEFAULT_SHIFT_WINDOWS,
): boolean {
  const win = config.windows[shiftLabel];
  if (!win) return false;
  const start = parseHm(win.start);
  const end = parseHm(win.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  const now = localMinutes(at, config.timezone);
  if (start === end) return true; // 24h open
  if (start < end) return now >= start && now < end;
  // overnight: e.g. 22:00–06:00
  return now >= start || now < end;
}

export function readShiftWindowConfig(): ShiftWindowConfig {
  if (typeof window === "undefined") return DEFAULT_SHIFT_WINDOWS;
  const parsed = shiftWindowSlot.get();
  if (!parsed) return DEFAULT_SHIFT_WINDOWS;
  return {
    timezone: parsed.timezone || DEFAULT_SHIFT_WINDOWS.timezone,
    windows: { ...DEFAULT_SHIFT_WINDOWS.windows, ...parsed.windows },
  };
}

/** The stored document, or null when this browser has not saved one. */
export function readStoredShiftWindow(): ShiftWindowConfig | null {
  if (typeof window === "undefined") return null;
  return shiftWindowSlot.get() ?? null;
}

/** Cache a server document. Does not push it back. */
export function adoptShiftWindowConfig(config: ShiftWindowConfig): void {
  if (typeof window === "undefined") return;
  shiftWindowSlot.set(config);
}

export function writeShiftWindowConfig(config: ShiftWindowConfig): void {
  if (typeof window === "undefined") return;
  shiftWindowSlot.set(config);
  pushShared("shift-windows", { kind: "shift-windows", record: config });
}

export function describeShiftWindow(
  shiftLabel: string,
  config: ShiftWindowConfig = DEFAULT_SHIFT_WINDOWS,
): string {
  const win = config.windows[shiftLabel];
  if (!win) return `${shiftLabel}: no window configured`;
  return `${shiftLabel} ${win.start}–${win.end} (${config.timezone})`;
}

// Per-login dashboard card order. The board is a 12-column flow; moving a
// card left/right swaps neighbors in the same row, up/down hops a row.
// Persistence is browser storage (lib/storage.ts) keyed by the signed-in
// username so two people on the same browser keep their own arrangement.

import { z } from "zod";
import { slot } from "@/lib/storage";

export const DASH_COLS = 12;
export const DASH_LAYOUT_VERSION = 1;
const KEY_PREFIX = "moid_dash_layout_v1_";

export type MoveDir = "left" | "right" | "up" | "down";

export function layoutStorageKey(userKey: string): string {
  const k = userKey.trim() || "anon";
  return `${KEY_PREFIX}${k}`;
}

export type StoredLayout = {
  order: string[];
  spans: Record<string, number>;
};

export function clampSpan(n: number): number {
  if (!Number.isFinite(n)) return DASH_COLS;
  return Math.min(DASH_COLS, Math.max(1, Math.round(n)));
}

function parseSpans(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, span] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || typeof span !== "number" || !Number.isFinite(span)) continue;
    out[id] = clampSpan(span);
  }
  return out;
}

export function parseLayout(raw: string | null | undefined): StoredLayout | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      return { order: v.filter((id) => id.length > 0), spans: {} };
    }
    if (
      v &&
      typeof v === "object" &&
      Array.isArray((v as { order?: unknown }).order) &&
      (v as { order: unknown[] }).order.every((x) => typeof x === "string")
    ) {
      const rec = v as { order: string[]; spans?: unknown };
      return {
        order: rec.order.filter((id) => id.length > 0),
        spans: parseSpans(rec.spans),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeLayout(layout: StoredLayout): string {
  return JSON.stringify({
    v: DASH_LAYOUT_VERSION,
    order: layout.order,
    spans: layout.spans,
  });
}

/** Saved widths win when the card is on screen; otherwise keep the default span. */
export function mergeSpans(
  saved: Record<string, number>,
  defaults: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(defaults)) {
    const s = saved[id];
    out[id] = s != null ? clampSpan(s) : defaults[id];
  }
  return out;
}

/**
 * Give leftover columns in a packed row to the cards in that row so the
 * line always fills the board — no empty strip along the right edge.
 */
export function expandRowSpans(
  order: string[],
  spans: Record<string, number>,
): Record<string, number> {
  const rows = packRows(order, spans);
  const out = { ...spans };
  for (const row of rows) {
    const used = row.reduce((sum, c) => sum + c.span, 0);
    const leftover = DASH_COLS - used;
    if (leftover <= 0 || row.length === 0) continue;
    for (let i = 0; i < leftover; i++) {
      const card = row[row.length - 1 - (i % row.length)];
      out[card.id] = (out[card.id] ?? card.span) + 1;
    }
  }
  return out;
}

export function spansEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if ((a[k] ?? DASH_COLS) !== (b[k] ?? DASH_COLS)) return false;
  }
  return true;
}

/** Map a horizontal drag onto the 12-column grid. */
export function spanFromDrag(startSpan: number, deltaPx: number, colWidth: number): number {
  if (!(colWidth > 0)) return clampSpan(startSpan);
  return clampSpan(startSpan + Math.round(deltaPx / colWidth));
}

/**
 * Keep the user's saved order for cards that are on screen. Drop ids that
 * are gone. Insert newly present cards at their default position (the next
 * default neighbor that is already in the result, else append).
 */
export function mergeOrder(saved: string[], present: string[]): string[] {
  const presentSet = new Set(present);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const id of saved) {
    if (presentSet.has(id) && !seen.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }

  for (let i = 0; i < present.length; i++) {
    const id = present[i];
    if (seen.has(id)) continue;
    let placed = false;
    for (let j = i - 1; j >= 0; j--) {
      const idx = out.indexOf(present[j]);
      if (idx !== -1) {
        out.splice(idx + 1, 0, id);
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (let j = i + 1; j < present.length; j++) {
        const idx = out.indexOf(present[j]);
        if (idx !== -1) {
          out.splice(idx, 0, id);
          placed = true;
          break;
        }
      }
    }
    if (!placed) out.push(id);
    seen.add(id);
  }

  return out;
}

export function ordersEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

type Packed = { id: string; span: number; col: number };

export function packRows(
  order: string[],
  spans: Record<string, number>,
): Packed[][] {
  const rows: Packed[][] = [];
  let row: Packed[] = [];
  let col = 0;

  for (const id of order) {
    const raw = spans[id] ?? DASH_COLS;
    const span = Math.min(DASH_COLS, Math.max(1, raw));
    if (col > 0 && col + span > DASH_COLS) {
      rows.push(row);
      row = [];
      col = 0;
    }
    row.push({ id, span, col });
    col += span;
    if (col >= DASH_COLS) {
      rows.push(row);
      row = [];
      col = 0;
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

function swapIds(order: string[], a: string, b: string): string[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return order;
  const next = order.slice();
  next[i] = b;
  next[j] = a;
  return next;
}

function moveTo(order: string[], id: string, beforeId?: string, afterId?: string): string[] {
  if (id === beforeId || id === afterId) return order;
  const without = order.filter((x) => x !== id);
  if (beforeId) {
    const i = without.indexOf(beforeId);
    if (i < 0) return order;
    without.splice(i, 0, id);
    return without;
  }
  if (afterId) {
    const i = without.indexOf(afterId);
    if (i < 0) return order;
    without.splice(i + 1, 0, id);
    return without;
  }
  return order;
}

export function moveCard(
  order: string[],
  id: string,
  dir: MoveDir,
  spans: Record<string, number>,
): string[] {
  const rows = packRows(order, spans);
  let r = -1;
  let k = -1;
  for (let i = 0; i < rows.length; i++) {
    const idx = rows[i].findIndex((c) => c.id === id);
    if (idx >= 0) {
      r = i;
      k = idx;
      break;
    }
  }
  if (r < 0 || k < 0) return order;

  const row = rows[r];
  if (dir === "left") {
    if (k === 0) return order;
    return swapIds(order, id, row[k - 1].id);
  }
  if (dir === "right") {
    if (k >= row.length - 1) return order;
    return swapIds(order, id, row[k + 1].id);
  }
  if (dir === "up") {
    if (r === 0) return order;
    return moveTo(order, id, rows[r - 1][0].id);
  }
  if (dir === "down") {
    if (r >= rows.length - 1) return order;
    const next = rows[r + 1];
    return moveTo(order, id, undefined, next[next.length - 1].id);
  }
  return order;
}

/** Insert `dragged` immediately before `target`. */
export function dropBefore(order: string[], dragged: string, target: string): string[] {
  if (!dragged || !target || dragged === target) return order;
  if (!order.includes(dragged) || !order.includes(target)) return order;
  const without = order.filter((id) => id !== dragged);
  const i = without.indexOf(target);
  if (i < 0) return order;
  without.splice(i, 0, dragged);
  return without;
}

// parseLayout is the one judge of what a stored layout means (it also accepts
// the pre-wrapper bare array), so the slot only asks "would parseLayout take it".
const layoutSlot = (userKey: string) =>
  slot({
    name: `dash-layout:${userKey.trim() || "anon"}`,
    schema: z.unknown().refine((v) => parseLayout(JSON.stringify(v)) !== null),
    legacyKeys: [layoutStorageKey(userKey)],
  });

export function readLayout(userKey: string): StoredLayout | null {
  const stored = layoutSlot(userKey).get();
  return stored === undefined ? null : parseLayout(JSON.stringify(stored));
}

export function writeLayout(userKey: string, layout: StoredLayout): void {
  if (typeof window === "undefined") return;
  if (layoutSlot(userKey).set(JSON.parse(serializeLayout(layout)))) {
    window.dispatchEvent(new Event("moid_dash_layout_changed"));
  }
}

export function clearLayout(userKey: string): void {
  if (typeof window === "undefined") return;
  layoutSlot(userKey).remove();
  window.dispatchEvent(new Event("moid_dash_layout_changed"));
}

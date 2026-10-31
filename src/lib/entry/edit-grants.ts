// Temporary edit grants issued when GM approves an out-of-window edit request.

import { z } from "zod";
import { slot } from "@/lib/storage";
import { pushShared, SHARED_STATE_EVENT } from "@/lib/shared-state/push";
import { invalidateAfterWrite } from "@/lib/client/invalidate";

export type EditGrant = {
  entryKey: string;
  approvedBy: string;
  approvedAt: string; // ISO
  expiresAt: string; // ISO
  notificationId?: string;
};

const grantsSlot = slot({
  name: "edit-grants",
  schema: z.array(
    z.object({
      entryKey: z.string(),
      approvedBy: z.string(),
      approvedAt: z.string(),
      expiresAt: z.string(),
      notificationId: z.string().optional(),
    }),
  ),
  legacyKeys: ["moid_edit_grants"],
});
export const DEFAULT_GRANT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Stable key for a batch entry row. */
export function entryKey(parts: {
  date: string;
  batchId: string;
  stageId: string;
  size: string;
  productType?: string;
}): string {
  const pt = parts.productType ?? "";
  return [parts.date, parts.batchId, parts.stageId, parts.size, pt].join("|");
}

const g = globalThis as unknown as { __moidEditGrants?: EditGrant[] };

function mem(): EditGrant[] {
  if (!g.__moidEditGrants) g.__moidEditGrants = [];
  return g.__moidEditGrants;
}

function loadAll(): EditGrant[] {
  if (typeof window !== "undefined") {
    const list = grantsSlot.get() ?? [];
    g.__moidEditGrants = list;
    return list;
  }
  return mem();
}

function saveAll(grants: EditGrant[]): void {
  g.__moidEditGrants = grants;
  if (typeof window === "undefined") return;
  grantsSlot.set(grants);
}

/** Replace the local cache without telling the server. Used by a pull. */
export function adoptGrants(grants: EditGrant[]): void {
  g.__moidEditGrants = grants;
  if (typeof window === "undefined") return;
  grantsSlot.set(grants);
}

/** Cache one server grant in this browser. Does not write it again. */
export function adoptGrant(grant: EditGrant): void {
  const rest = loadAll().filter((gr) => gr.entryKey !== grant.entryKey);
  adoptGrants([grant, ...rest]);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHARED_STATE_EVENT, { detail: { kind: "edit-grants" } }));
  // The grant was issued on the server. This browser did not call issueGrant,
  // so the cache has to be told from here.
  void invalidateAfterWrite("grants");
}

/** Drop expired grants and return active ones. */
export function listActiveGrants(now: Date = new Date()): EditGrant[] {
  const t = now.getTime();
  const active = loadAll().filter((gr) => new Date(gr.expiresAt).getTime() > t);
  saveAll(active);
  return active;
}

export function hasValidGrant(key: string, now: Date = new Date()): boolean {
  return listActiveGrants(now).some((gr) => gr.entryKey === key);
}

export function issueGrant(opts: {
  entryKey: string;
  approvedBy: string;
  ttlMs?: number;
  notificationId?: string;
  now?: Date;
}): EditGrant {
  const now = opts.now ?? new Date();
  const ttl = opts.ttlMs ?? DEFAULT_GRANT_TTL_MS;
  const grant: EditGrant = {
    entryKey: opts.entryKey,
    approvedBy: opts.approvedBy,
    approvedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    notificationId: opts.notificationId,
  };
  const rest = loadAll().filter((gr) => gr.entryKey !== opts.entryKey);
  saveAll([grant, ...rest]);
  pushShared("edit-grants", { kind: "edit-grants", grant });
  void invalidateAfterWrite("grants");
  return grant;
}

export function revokeGrant(key: string): void {
  saveAll(loadAll().filter((gr) => gr.entryKey !== key));
  pushShared("edit-grants", { kind: "edit-grants", revokeEntryKey: key });
  void invalidateAfterWrite("grants");
}

export function __resetGrantsForTests(): void {
  g.__moidEditGrants = [];
  if (typeof window !== "undefined") grantsSlot.remove();
}

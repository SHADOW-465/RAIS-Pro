// Shapes stored in plant_shared_state. One document per kind.
// Built-in report presets are not stored — they ship with the app.

import { z } from "zod";

export const SHARED_KINDS = [
  "report-presets",
  "workspace-presets",
  "shift-windows",
  "lot-memory",
  "edit-grants",
  "custom-defects",
] as const;

export type SharedKind = (typeof SHARED_KINDS)[number];

export function isSharedKind(value: string | null | undefined): value is SharedKind {
  return typeof value === "string" && (SHARED_KINDS as readonly string[]).includes(value);
}

export type SharedCapability = "write" | "configure" | "approve";

/** Who may replace a document. Reading is any signed-in role. */
export function capabilityFor(kind: SharedKind): SharedCapability {
  if (kind === "shift-windows" || kind === "custom-defects") return "configure";
  if (kind === "edit-grants") return "approve";
  return "write";
}

export const grantSchema = z.object({
  entryKey: z.string().trim().min(1).max(500),
  approvedBy: z.string().trim().min(1).max(200),
  approvedAt: z.string().min(1).max(40),
  expiresAt: z.string().min(1).max(40),
  notificationId: z.string().max(200).optional(),
});

export type StoredGrant = z.infer<typeof grantSchema>;

const presetRow = z.looseObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
});

const schemas: Record<SharedKind, z.ZodType> = {
  "report-presets": z.array(presetRow).max(500),
  "workspace-presets": z.array(
    presetRow.extend({
      reportType: z.string().min(1).max(80),
      periodMode: z.string().min(1).max(80),
    }),
  ).max(500),
  "shift-windows": z.object({
    timezone: z.string().min(1).max(80),
    windows: z.record(
      z.string().max(80),
      z.object({ start: z.string().min(1).max(8), end: z.string().min(1).max(8) }),
    ),
  }),
  "lot-memory": z.object({
    on: z.boolean(),
    batchId: z.string().max(40),
    batchDate: z.string().max(40),
    size: z.string().max(40),
    category: z.string().max(80).optional(),
    catheterType: z.string().max(80).optional(),
    productType: z.string().max(80).optional(),
  }).nullable(),
  "edit-grants": z.union([
    z.object({ grants: z.array(grantSchema).max(2000) }),
    z.array(grantSchema).max(2000),
  ]),
  "custom-defects": z.array(z.object({
    code: z.string().min(1).max(40),
    label: z.string().min(1).max(200),
    aliases: z.string().max(500),
  })).max(500),
};

function withoutBuiltIns(rows: unknown[]): unknown[] {
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return false;
    const p = row as { id?: string; builtIn?: boolean };
    return p.builtIn !== true && !String(p.id ?? "").startsWith("builtin:");
  });
}

/** Zod-check a document and drop built-in presets. */
export function parseKindRecord(
  kind: SharedKind,
  record: unknown,
): { ok: true; record: unknown } | { ok: false } {
  const parsed = schemas[kind].safeParse(record);
  if (!parsed.success) return { ok: false };
  let value: unknown = parsed.data;
  if (kind === "report-presets" || kind === "workspace-presets") {
    value = withoutBuiltIns(value as unknown[]);
  }
  if (kind === "edit-grants" && Array.isArray(value)) {
    value = { grants: value };
  }
  return { ok: true, record: value };
}

/** A missing or blank document. A saved shift-window object is never blank. */
export function isEmptyRecord(kind: SharedKind, record: unknown): boolean {
  if (record == null) return true;
  if (kind === "shift-windows") return false;
  if (kind === "lot-memory") {
    if (typeof record !== "object") return true;
    const pin = record as { on?: boolean; batchId?: string };
    return pin.on === false || typeof pin.batchId !== "string" || !pin.batchId.trim();
  }
  if (kind === "edit-grants") {
    if (Array.isArray(record)) return record.length === 0;
    const grants = (record as { grants?: unknown }).grants;
    return !Array.isArray(grants) || grants.length === 0;
  }
  if (Array.isArray(record)) return record.length === 0;
  return false;
}

export function grantsOf(record: unknown): StoredGrant[] {
  if (Array.isArray(record)) return record as StoredGrant[];
  if (record && typeof record === "object" && Array.isArray((record as { grants?: unknown }).grants)) {
    return (record as { grants: StoredGrant[] }).grants;
  }
  return [];
}

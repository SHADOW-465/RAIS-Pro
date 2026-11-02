// Persistence for batch lineage. Own table. Own adapters.
// Does not go through EventStore, so analytics never see these rows.

import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";
import { lineageChain } from "./graph";
import {
  ConversionError,
  LineageUnavailableError,
  REASON_COLUMNS_MESSAGE,
  REVERSAL_COLUMNS_MESSAGE,
  type BatchConversion,
  type ConversionAudit,
  type CreateConversionInput,
  type LineageNode,
} from "./types";
import { canonLot, nextConversionId } from "./ids";
import { planConversion } from "./validate";

export interface ReverseConversionInput {
  id: string;
  actor: string;
  reason: string;
}

export interface ReverseConversionResult {
  conversion: BatchConversion;
  audit: ConversionAudit;
  /** False when the audit table is not there yet. The reversal on the row still stands. */
  auditStored: boolean;
}

export interface LineageStore {
  /** Active conversions only. A reversed row is not a current lineage edge. */
  list(): Promise<BatchConversion[]>;
  create(input: CreateConversionInput): Promise<BatchConversion>;
  chainFor(batch: string): Promise<LineageNode[]>;
  reverse(input: ReverseConversionInput): Promise<ReverseConversionResult>;
}

function activeOf(rows: BatchConversion[]): BatchConversion[] {
  return rows.filter((r) => !r.reversedAt);
}

class MemoryLineageStore implements LineageStore {
  private rows: BatchConversion[] = [];
  private audits: ConversionAudit[] = [];

  async list() {
    return activeOf(this.rows).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }

  async create(input: CreateConversionInput) {
    const active = activeOf(this.rows);
    let row = planConversion(input, active);
    if (active.some((r) => r.id === row.id)) return row;
    if (this.rows.some((r) => r.id === row.id)) row = { ...row, id: nextConversionId(row.id, this.rows) };
    this.rows = [row, ...this.rows];
    return row;
  }

  async chainFor(batch: string) {
    const lot = canonLot(batch) ?? (batch || "").trim().toUpperCase();
    return lineageChain(lot, activeOf(this.rows));
  }

  async reverse(input: ReverseConversionInput) {
    const reason = input.reason.trim();
    if (!reason) throw new ConversionError("reason-required", "Say why this conversion is being undone.");
    const row = activeOf(this.rows).find((r) => r.id === input.id);
    if (!row) throw new ConversionError("not-found", "That conversion is not active, so it cannot be undone.");
    const reversed: BatchConversion = {
      ...row,
      reversedAt: new Date().toISOString(),
      reversedBy: input.actor.trim() || "unknown",
      reversalReason: reason,
    };
    this.rows = this.rows.map((r) => (r.id === row.id ? reversed : r));
    const audit: ConversionAudit = {
      id: `bca_${row.id}_${Date.now()}`,
      conversionId: row.id,
      action: "reversed",
      actor: reversed.reversedBy || "unknown",
      reason,
      at: reversed.reversedAt || new Date().toISOString(),
      snapshot: reversed,
    };
    this.audits = [audit, ...this.audits];
    return { conversion: reversed, audit, auditStored: true };
  }
}

type DbRow = {
  id: string;
  from_batch: string;
  to_batch: string;
  from_size: string;
  to_size: string;
  changed_qty?: number | string | null;
  stage_id?: string | null;
  converted_on: string;
  reason: string;
  reason_category?: string | null;
  reason_note?: string | null;
  created_at: string;
  created_by: string;
  reversed_at?: string | null;
  reversed_by?: string | null;
  reversal_reason?: string | null;
};

function fromDb(r: DbRow): BatchConversion {
  const qty = Number(r.changed_qty ?? 0);
  return {
    id: r.id,
    fromBatch: r.from_batch,
    toBatch: r.to_batch,
    fromSize: r.from_size,
    toSize: r.to_size,
    changedQty: Number.isFinite(qty) ? qty : 0,
    stageId: (r.stage_id ?? "").trim(),
    convertedOn: r.converted_on,
    reason: r.reason,
    reasonCategory: (r.reason_category ?? "").trim(),
    reasonNote: (r.reason_note ?? "").trim(),
    createdAt: r.created_at,
    createdBy: r.created_by,
    reversedAt: r.reversed_at ?? null,
    reversedBy: r.reversed_by ?? null,
    reversalReason: r.reversal_reason ?? null,
  };
}

function toDb(n: BatchConversion): DbRow {
  return {
    id: n.id,
    from_batch: n.fromBatch,
    to_batch: n.toBatch,
    from_size: n.fromSize,
    to_size: n.toSize,
    changed_qty: n.changedQty,
    stage_id: n.stageId,
    converted_on: n.convertedOn,
    reason: n.reason,
    reason_category: n.reasonCategory,
    reason_note: n.reasonNote,
    created_at: n.createdAt,
    created_by: n.createdBy,
  };
}

function mentionsColumn(err: { message?: string }, names: string[]): boolean {
  const msg = (err.message ?? "").toLowerCase();
  return names.some((n) => msg.includes(n));
}

function missingColumn(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204";
}

/** The table (or one of its columns) is not there: a migration has not been applied. */
function storageMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    err.code === "42703" ||
    err.code === "PGRST204" ||
    (/batch_conversions/i.test(msg) && /does not exist|not find|schema cache/i.test(msg))
  );
}

function unavailable(err: { code?: string; message?: string }, message?: string): LineageUnavailableError {
  console.warn(
    `[lineage] batch_conversions is not usable (${err.code ?? "no code"}: ${err.message ?? ""}). ` +
      "Refusing to record or list conversions until the migration is applied.",
  );
  return new LineageUnavailableError(err.code, message);
}

// PostgREST caps one select at 1000 rows, so read in pages. created_at alone
// is not unique (two saves can share a timestamp), so id breaks the tie and a
// row can neither repeat nor vanish between pages.
const PAGE = 1000;

export class SupabaseLineageStore implements LineageStore {
  private db() {
    return createServerClient();
  }

  private async allRows(): Promise<BatchConversion[]> {
    const out: BatchConversion[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db()
        .from("batch_conversions")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        if (storageMissing(error)) throw unavailable(error);
        throw error;
      }
      const page = data ?? [];
      out.push(...page.map((r) => fromDb(r as DbRow)));
      if (page.length < PAGE) break;
    }
    return out;
  }

  private async activeRows() {
    return activeOf(await this.allRows());
  }

  async list() {
    return this.activeRows();
  }

  async create(input: CreateConversionInput) {
    const all = await this.allRows();
    const existing = activeOf(all);
    let row = planConversion(input, existing);
    if (existing.some((r) => r.id === row.id)) return row;
    if (all.some((r) => r.id === row.id)) row = { ...row, id: nextConversionId(row.id, all) };
    const { data, error } = await this.db()
      .from("batch_conversions")
      .insert(toDb(row))
      .select("*")
      .single();
    if (error) {
      if (missingColumn(error) && mentionsColumn(error, ["reason_category", "reason_note"])) {
        throw unavailable(error, REASON_COLUMNS_MESSAGE);
      }
      if (storageMissing(error)) throw unavailable(error);
      if (error.code === "23505") {
        // Lost a race to another save. Re-plan against the fresh active rows:
        // that returns the winner for an identical repeat and throws the
        // precise reason (other quantity, target taken) for anything else.
        const againAll = await this.allRows();
        const again = activeOf(againAll);
        const replanned = planConversion(input, again);
        const hit = again.find((r) => r.id === replanned.id);
        if (hit) return hit;
        throw new ConversionError("target-taken", error.message);
      }
      throw error;
    }
    return fromDb(data as DbRow);
  }

  async chainFor(batch: string) {
    const lot = canonLot(batch) ?? (batch || "").trim().toUpperCase();
    return lineageChain(lot, await this.activeRows());
  }

  async reverse(input: ReverseConversionInput): Promise<ReverseConversionResult> {
    const reason = input.reason.trim();
    if (!reason) throw new ConversionError("reason-required", "Say why this conversion is being undone.");
    const row = (await this.activeRows()).find((r) => r.id === input.id);
    if (!row) throw new ConversionError("not-found", "That conversion is not active, so it cannot be undone.");
    const reversedAt = new Date().toISOString();
    const reversedBy = input.actor.trim() || "unknown";
    const { data, error } = await this.db()
      .from("batch_conversions")
      .update({ reversed_at: reversedAt, reversed_by: reversedBy, reversal_reason: reason })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) {
      if (missingColumn(error) || storageMissing(error)) throw unavailable(error, REVERSAL_COLUMNS_MESSAGE);
      throw error;
    }
    const conversion = fromDb(data as DbRow);
    const audit: ConversionAudit = {
      id: `bca_${row.id}_${Date.now()}`,
      conversionId: row.id,
      action: "reversed",
      actor: reversedBy,
      reason,
      at: conversion.reversedAt || reversedAt,
      snapshot: conversion,
    };
    const { error: auditErr } = await this.db()
      .from("batch_conversion_audits")
      .insert({
        id: audit.id,
        conversion_id: audit.conversionId,
        action: audit.action,
        actor: audit.actor,
        reason: audit.reason,
        at: audit.at,
        snapshot: audit.snapshot,
      });
    if (auditErr) {
      console.warn(
        `[lineage] reversal of ${row.id} is saved on the row, but the audit insert failed ` +
          `(${auditErr.code ?? "no code"}: ${auditErr.message ?? ""}).`,
      );
      return { conversion, audit, auditStored: false };
    }
    return { conversion, audit, auditStored: true };
  }
}

const g = globalThis as unknown as { __moidLineageStore?: LineageStore };

export function getLineageStore(): LineageStore {
  if (!g.__moidLineageStore) {
    g.__moidLineageStore = shouldUseSupabase()
      ? new SupabaseLineageStore()
      : new MemoryLineageStore();
  }
  return g.__moidLineageStore;
}

export function __resetLineageStoreForTests(): void {
  g.__moidLineageStore = new MemoryLineageStore();
}

// Persistence for batch lineage. Own table. Own adapters.
// Does not go through EventStore, so analytics never see these rows.

import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";
import { lineageChain } from "./graph";
import { ConversionError, LineageUnavailableError, type BatchConversion, type CreateConversionInput, type LineageNode } from "./types";
import { canonLot } from "./ids";
import { planConversion } from "./validate";

export interface LineageStore {
  list(): Promise<BatchConversion[]>;
  create(input: CreateConversionInput): Promise<BatchConversion>;
  chainFor(batch: string): Promise<LineageNode[]>;
}

class MemoryLineageStore implements LineageStore {
  private rows: BatchConversion[] = [];

  async list() {
    return this.rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  }

  async create(input: CreateConversionInput) {
    const row = planConversion(input, this.rows);
    if (this.rows.some((r) => r.id === row.id)) return row;
    this.rows = [row, ...this.rows];
    return row;
  }

  async chainFor(batch: string) {
    const lot = canonLot(batch) ?? (batch || "").trim().toUpperCase();
    return lineageChain(lot, this.rows);
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
  created_at: string;
  created_by: string;
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
    createdAt: r.created_at,
    createdBy: r.created_by,
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
    created_at: n.createdAt,
    created_by: n.createdBy,
  };
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

function unavailable(err: { code?: string; message?: string }): LineageUnavailableError {
  console.warn(
    `[lineage] batch_conversions is not usable (${err.code ?? "no code"}: ${err.message ?? ""}). ` +
      "Refusing to record or list conversions until the migration is applied.",
  );
  return new LineageUnavailableError(err.code);
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

  async list() {
    return this.allRows();
  }

  async create(input: CreateConversionInput) {
    const existing = await this.allRows();
    const row = planConversion(input, existing);
    if (existing.some((r) => r.id === row.id)) return row;
    const { data, error } = await this.db()
      .from("batch_conversions")
      .insert(toDb(row))
      .select("*")
      .single();
    if (error) {
      if (storageMissing(error)) throw unavailable(error);
      if (error.code === "23505") {
        // Lost a race to another save. Re-plan against the fresh rows: that
        // returns the winner for an identical repeat and throws the precise
        // reason (other quantity, target taken) for anything else.
        const again = await this.allRows();
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
    return lineageChain(lot, await this.allRows());
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

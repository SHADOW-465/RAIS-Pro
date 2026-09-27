// Persistence for batch lineage. Own table. Own adapters.
// Does not go through EventStore, so analytics never see these rows.

import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";
import { lineageChain } from "./graph";
import { ConversionError, type BatchConversion, type CreateConversionInput, type LineageNode } from "./types";
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
    return this.rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  converted_on: string;
  reason: string;
  created_at: string;
  created_by: string;
};

function fromDb(r: DbRow): BatchConversion {
  return {
    id: r.id,
    fromBatch: r.from_batch,
    toBatch: r.to_batch,
    fromSize: r.from_size,
    toSize: r.to_size,
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
    converted_on: n.convertedOn,
    reason: n.reason,
    created_at: n.createdAt,
    created_by: n.createdBy,
  };
}

function tableMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  const msg = err.message ?? "";
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    (/batch_conversions/i.test(msg) && /does not exist|not find|schema cache/i.test(msg))
  );
}

class SupabaseLineageStore implements LineageStore {
  private fallback = new MemoryLineageStore();
  private missingTable = false;

  private db() {
    return createServerClient();
  }

  private async allRows(): Promise<BatchConversion[]> {
    if (this.missingTable) return this.fallback.list();
    const { data, error } = await this.db()
      .from("batch_conversions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      if (tableMissing(error)) {
        this.missingTable = true;
        return this.fallback.list();
      }
      throw error;
    }
    return (data ?? []).map((r) => fromDb(r as DbRow));
  }

  async list() {
    return this.allRows();
  }

  async create(input: CreateConversionInput) {
    const existing = await this.allRows();
    const row = planConversion(input, existing);
    if (existing.some((r) => r.id === row.id)) return row;
    if (this.missingTable) return this.fallback.create(input);
    const { data, error } = await this.db()
      .from("batch_conversions")
      .insert(toDb(row))
      .select("*")
      .single();
    if (error) {
      if (tableMissing(error)) {
        this.missingTable = true;
        return this.fallback.create(input);
      }
      if (error.code === "23505") {
        const again = await this.allRows();
        const hit = again.find((r) => r.id === row.id);
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

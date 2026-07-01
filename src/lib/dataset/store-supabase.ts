import { createServerClient } from "@/lib/supabase";
import type { Dataset } from "./types";
import type { DatasetStore } from "./store";
import { sortDatasets } from "./store";

interface DatasetRow {
  id: string;
  signature_hash: string;
  title: string;
  columns: Dataset["columns"];
  sources: Dataset["sources"];
  total_rows: number;
  updated_at: string;
}

function toRow(d: Dataset): DatasetRow {
  return {
    id: d.id,
    signature_hash: d.signatureHash,
    title: d.title,
    columns: d.columns,
    sources: d.sources,
    total_rows: d.totalRows,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(r: DatasetRow): Dataset {
  return {
    id: r.id,
    signatureHash: r.signature_hash,
    title: r.title,
    columns: r.columns,
    sources: r.sources,
    totalRows: r.total_rows,
  };
}

// No chunking/pagination here (unlike SupabaseEventStore): datasets are expected
// in the tens, each with one representative column-set, not high-volume events.
// Revisit with chunk()/`.range()` (see ./batch, SupabaseEventStore) if that changes.
export class SupabaseDatasetStore implements DatasetStore {
  private get client() {
    return createServerClient();
  }

  async upsert(datasets: Dataset[]): Promise<void> {
    if (datasets.length === 0) return;
    const rows = datasets.map(toRow);
    const { error } = await this.client.from("datasets").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }

  async list(): Promise<Dataset[]> {
    const { data, error } = await this.client.from("datasets").select("*");
    if (error) throw error;
    return sortDatasets((data ?? []).map(fromRow));
  }

  async clear(): Promise<void> {
    const { error } = await this.client.from("datasets").delete().neq("id", "");
    if (error) throw error;
  }
}

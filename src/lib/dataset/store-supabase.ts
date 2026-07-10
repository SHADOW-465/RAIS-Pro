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
  recognized_stage_id?: string | null;
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
    recognized_stage_id: d.recognizedStageId ?? null,
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
    recognizedStageId: r.recognized_stage_id ?? null,
    // ponytail: Supabase doesn't persist these yet; default to null until that lands.
    recognitionConfidence: null,
    recognitionBasis: null,
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
    if (error) {
      // Transitional: until supabase/migrations/20260702_dataset_recognized_stage.sql
      // is applied, the live table lacks recognized_stage_id and the upsert fails
      // on the unknown column. Retry once without it so persistence keeps working
      // (recognition simply won't survive a round-trip until the migration lands).
      if (/recognized_stage_id/i.test(error.message ?? "")) {
        const legacyRows = rows.map(({ recognized_stage_id: _drop, ...rest }) => rest);
        const { error: retryError } = await this.client.from("datasets").upsert(legacyRows, { onConflict: "id" });
        if (retryError) throw retryError;
        return;
      }
      throw error;
    }
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

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
  recognition_confidence?: number | null;
  recognition_basis?: Dataset["recognitionBasis"];
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
    recognition_confidence: d.recognitionConfidence ?? null,
    recognition_basis: d.recognitionBasis ?? null,
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
    recognitionConfidence: r.recognition_confidence ?? null,
    recognitionBasis: r.recognition_basis ?? null,
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
      // and/or 20260711_dataset_recognition_confidence.sql are applied, the live
      // table lacks one or more of these columns and the upsert fails on the
      // unknown column. Retry once without whichever ones the error names, so
      // persistence keeps working (recognition/confidence simply won't survive
      // a round-trip until the migration lands).
      const msg = error.message ?? "";
      const dropRecognizedStage = /recognized_stage_id/i.test(msg);
      const dropConfidence = /recognition_confidence/i.test(msg);
      const dropBasis = /recognition_basis/i.test(msg);
      if (dropRecognizedStage || dropConfidence || dropBasis) {
        const legacyRows = rows.map((row) => {
          const r = { ...row };
          if (dropRecognizedStage) delete r.recognized_stage_id;
          if (dropConfidence) delete r.recognition_confidence;
          if (dropBasis) delete r.recognition_basis;
          return r;
        });
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

import { createServerClient } from "@/lib/supabase";
import { chunk } from "@/lib/store/batch";
import type { DatasetRow } from "./types";
import type { RowStore } from "./row-store";

interface RowRow {
  dataset_id: string;
  file_name: string;
  sheet_name: string;
  row_index: number;
  values: DatasetRow["values"];
  updated_at: string;
}

function toRow(r: DatasetRow): RowRow {
  return {
    dataset_id: r.datasetId,
    file_name: r.fileName,
    sheet_name: r.sheetName,
    row_index: r.rowIndex,
    values: r.values,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(r: RowRow): DatasetRow {
  return { datasetId: r.dataset_id, fileName: r.file_name, sheetName: r.sheet_name, rowIndex: r.row_index, values: r.values };
}

const UPSERT_BATCH = 500; // mirrors SupabaseEventStore's INSERT_BATCH convention

export class SupabaseRowStore implements RowStore {
  private get client() {
    return createServerClient();
  }

  async upsert(rows: DatasetRow[]): Promise<void> {
    if (rows.length === 0) return;
    for (const batch of chunk(rows.map(toRow), UPSERT_BATCH)) {
      const { error } = await this.client
        .from("dataset_rows")
        .upsert(batch, { onConflict: "dataset_id,file_name,sheet_name,row_index" });
      if (error) throw error;
    }
  }

  async forDataset(datasetId: string): Promise<DatasetRow[]> {
    const PAGE = 1000;
    const out: DatasetRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from("dataset_rows")
        .select("*")
        .eq("dataset_id", datasetId)
        .order("file_name")
        .order("sheet_name")
        .order("row_index")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...(data ?? []).map(fromRow));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async clear(): Promise<void> {
    const { error } = await this.client.from("dataset_rows").delete().neq("dataset_id", "");
    if (error) throw error;
  }
}

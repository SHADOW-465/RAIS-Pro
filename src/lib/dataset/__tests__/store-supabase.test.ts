// Mocks @/lib/supabase's createServerClient with a minimal fake table backed
// by an in-memory array, so this test exercises SupabaseDatasetStore's real
// toRow()/fromRow() mapping without touching a live Supabase project.
import type { Dataset } from "../types";

let rows: Record<string, unknown>[] = [];
let missingColumns: string[] = [];

function fakeClient() {
  return {
    from(_table: string) {
      return {
        upsert(newRows: Record<string, unknown>[], _opts: { onConflict: string }) {
          if (missingColumns.length > 0) {
            const hit = missingColumns.find((c) => newRows.some((r) => c in r));
            if (hit) return Promise.resolve({ error: { message: `column "${hit}" does not exist` } });
          }
          for (const row of newRows) {
            const i = rows.findIndex((r) => r.id === row.id);
            if (i >= 0) rows[i] = row;
            else rows.push(row);
          }
          return Promise.resolve({ error: null });
        },
        select(_cols: string) {
          return Promise.resolve({ data: rows, error: null });
        },
        delete() {
          return { neq: (_col: string, _val: string) => { rows = []; return Promise.resolve({ error: null }); } };
        },
      };
    },
  };
}

jest.mock("../../supabase", () => ({ createServerClient: () => fakeClient() }));

import { SupabaseDatasetStore } from "../store-supabase";

const ds = (overrides: Partial<Dataset> = {}): Dataset => ({
  id: "ds1",
  signatureHash: "ds1",
  title: "Visual QC",
  columns: [],
  sources: [{ fileName: "a.xlsx", sheetName: "VISUAL", rowCount: 10 }],
  totalRows: 10,
  recognizedStageId: "visual",
  recognitionConfidence: 0.6,
  recognitionBasis: "heuristic",
  ...overrides,
});

describe("SupabaseDatasetStore recognitionConfidence/recognitionBasis persistence", () => {
  beforeEach(() => {
    rows = [];
    missingColumns = [];
  });

  it("round-trips a non-null recognitionConfidence/recognitionBasis through upsert + list", async () => {
    const store = new SupabaseDatasetStore();
    await store.upsert([ds()]);
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0].recognitionConfidence).toBe(0.6);
    expect(all[0].recognitionBasis).toBe("heuristic");
  });

  it("falls back to legacy shape when the recognition_confidence column is missing", async () => {
    missingColumns = ["recognition_confidence"];
    const store = new SupabaseDatasetStore();
    await store.upsert([ds()]);
    const all = await store.list();
    expect(all).toHaveLength(1);
    // Migration not applied yet — Supabase doesn't have this one column, so the
    // retry drops just it; recognition_basis (present) still persists normally.
    expect(all[0].recognitionConfidence).toBeNull();
    expect(all[0].recognitionBasis).toBe("heuristic");
    expect(all[0].id).toBe("ds1");
  });

  it("defaults recognitionConfidence/recognitionBasis to null for a legacy row missing those fields", async () => {
    rows = [{
      id: "legacy",
      signature_hash: "legacy",
      title: "Old Row",
      columns: [],
      sources: [],
      total_rows: 3,
      recognized_stage_id: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    }];
    const store = new SupabaseDatasetStore();
    const all = await store.list();
    expect(all[0].recognitionConfidence).toBeNull();
    expect(all[0].recognitionBasis).toBeNull();
  });
});

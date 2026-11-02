// The Supabase adapter against a fake PostgREST client: no network, no database.

jest.mock("@/lib/supabase", () => ({ createServerClient: jest.fn() }));

import { createServerClient } from "@/lib/supabase";
import { SupabaseLineageStore } from "../store";
import { LineageUnavailableError } from "../types";

type Err = { code?: string; message?: string };

/**
 * Minimal chainable stand-in for the calls the store makes. `rowsByRead` lets
 * a test change what the table holds from one read to the next (a race).
 */
function fakeClient(opts: {
  rowsByRead?: Record<string, unknown>[][];
  selectError?: Err;
  insertError?: Err;
  updateError?: Err;
  auditInsertError?: Err;
}) {
  const log = {
    orders: [] as string[],
    ranges: [] as [number, number][],
    inserts: [] as unknown[],
    updates: [] as unknown[],
    reads: 0,
  };
  const client = {
    from: (table: string) => ({
      select: () => {
        // a "read" starts at range offset 0
        let rows: Record<string, unknown>[] | null = null;
        const q = {
          order: (col: string) => (log.orders.push(col), q),
          range: async (a: number, b: number) => {
            log.ranges.push([a, b]);
            if (opts.selectError) return { data: null, error: opts.selectError };
            if (a === 0 || !rows) {
              const sets = opts.rowsByRead ?? [[]];
              rows = sets[Math.min(log.reads, sets.length - 1)];
              if (a === 0) log.reads += 1;
            }
            return { data: rows.slice(a, b + 1), error: null };
          },
        };
        return q;
      },
      insert: (row: unknown) => {
        log.inserts.push(row);
        const auditErr = table === "batch_conversion_audits" ? (opts.auditInsertError ?? null) : null;
        return {
          error: auditErr,
          select: () => ({
            single: async () =>
              opts.insertError ? { data: null, error: opts.insertError } : { data: row, error: null },
          }),
        };
      },
      update: (patch: unknown) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              log.updates.push(patch);
              if (opts.updateError) return { data: null, error: opts.updateError };
              const base = (opts.rowsByRead ?? [[]])[0]?.[0] ?? {};
              return { data: { ...base, ...(patch as object) }, error: null };
            },
          }),
        }),
      }),
    }),
  };
  (createServerClient as jest.Mock).mockReturnValue(client);
  return log;
}

const input = {
  fromBatch: "26I21-14",
  toSize: "16Fr",
  changedQty: 120,
  stageId: "visual",
  convertedOn: "2026-09-23",
  reasonCategory: "size-reclassification",
  reasonNote: "size",
  createdBy: "gm",
};

function dbRow(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `bc_${i}`,
    from_batch: `A${i}`,
    to_batch: `B${i}`,
    from_size: "14Fr",
    to_size: "16Fr",
    changed_qty: i,
    stage_id: "visual",
    converted_on: "2026-09-23",
    reason: "r",
    created_at: "2026-09-23T00:00:00Z",
    created_by: "gm",
    ...extra,
  };
}

const existing = (qty: number) =>
  dbRow(1, { id: "bc_26I21-14_26I21-16", from_batch: "26I21-14", to_batch: "26I21-16", changed_qty: qty });

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("missing table is a hard failure, never an in-memory success", () => {
  const missing = { code: "42P01", message: 'relation "batch_conversions" does not exist' };

  test("list throws LineageUnavailableError and warns on the server", async () => {
    fakeClient({ selectError: missing });
    await expect(new SupabaseLineageStore().list()).rejects.toBeInstanceOf(LineageUnavailableError);
    expect(console.warn).toHaveBeenCalled();
  });

  test("create throws, and a following list still throws (nothing was kept in memory)", async () => {
    fakeClient({ selectError: missing });
    const store = new SupabaseLineageStore();
    await expect(store.create(input)).rejects.toBeInstanceOf(LineageUnavailableError);
    await expect(store.list()).rejects.toBeInstanceOf(LineageUnavailableError);
  });

  test("an insert hitting a missing table or column is also unavailable", async () => {
    fakeClient({ insertError: { code: "PGRST205", message: "Could not find the table in the schema cache" } });
    await expect(new SupabaseLineageStore().create(input)).rejects.toBeInstanceOf(LineageUnavailableError);
    fakeClient({ insertError: { code: "42703", message: 'column "changed_qty" does not exist' } });
    await expect(new SupabaseLineageStore().create(input)).rejects.toBeInstanceOf(LineageUnavailableError);
  });

  test("other database errors are not disguised as 'unavailable'", async () => {
    fakeClient({ selectError: { code: "57014", message: "statement timeout" } });
    await expect(new SupabaseLineageStore().list()).rejects.not.toBeInstanceOf(LineageUnavailableError);
  });
});

describe("reading all conversions", () => {
  test("pages past the 1000-row cap, newest first with id as the tie-break", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => dbRow(i));
    const log = fakeClient({ rowsByRead: [all] });
    const list = await new SupabaseLineageStore().list();
    expect(list).toHaveLength(2500);
    expect(new Set(list.map((r) => r.id)).size).toBe(2500);
    expect(log.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(log.orders.slice(0, 2)).toEqual(["created_at", "id"]);
  });

  test("an exact multiple of the page size reads one more page and stops on the empty one", async () => {
    const log = fakeClient({ rowsByRead: [Array.from({ length: 1000 }, (_, i) => dbRow(i))] });
    expect(await new SupabaseLineageStore().list()).toHaveLength(1000);
    expect(log.ranges).toEqual([[0, 999], [1000, 1999]]);
  });
});

describe("create", () => {
  test("inserts a new conversion", async () => {
    const log = fakeClient({});
    const row = await new SupabaseLineageStore().create(input);
    expect(row.toBatch).toBe("26I21-16");
    expect(log.inserts).toHaveLength(1);
    expect(log.inserts[0]).toMatchObject({
      reason_category: "size-reclassification",
      reason_note: "size",
    });
  });

  test("an identical repeat inserts nothing", async () => {
    const log = fakeClient({ rowsByRead: [[existing(120)]] });
    const row = await new SupabaseLineageStore().create(input);
    expect(row.changedQty).toBe(120);
    expect(log.inserts).toHaveLength(0);
  });

  test("a different quantity for an already-converted lot is refused before any insert", async () => {
    const log = fakeClient({ rowsByRead: [[existing(200)]] });
    await expect(new SupabaseLineageStore().create(input)).rejects.toMatchObject({ code: "already-converted" });
    expect(log.inserts).toHaveLength(0);
  });

  test("losing a race to a save with another quantity surfaces that reason", async () => {
    // first read: empty. The insert then collides; the winner is visible on re-read.
    fakeClient({ rowsByRead: [[], [existing(50)]], insertError: { code: "23505", message: "duplicate key" } });
    await expect(new SupabaseLineageStore().create(input)).rejects.toMatchObject({ code: "already-converted" });
  });

  test("losing a race to an identical save returns the winner", async () => {
    fakeClient({ rowsByRead: [[], [existing(120)]], insertError: { code: "23505", message: "duplicate key" } });
    const row = await new SupabaseLineageStore().create(input);
    expect(row.id).toBe("bc_26I21-14_26I21-16");
  });

  test("a missing reason column refuses the save and names the migration", async () => {
    fakeClient({
      insertError: { code: "42703", message: 'column "reason_category" of relation "batch_conversions" does not exist' },
    });
    await expect(new SupabaseLineageStore().create(input)).rejects.toThrow(/20261031130000_batch_conversion_reason/);
    await expect(new SupabaseLineageStore().create(input)).rejects.toThrow(/Nothing was saved/);
  });
});

describe("reverse", () => {
  test("marks the row and writes an audit, and list omits the reversed row", async () => {
    fakeClient({
      rowsByRead: [[existing(120), dbRow(2, { reversed_at: "2026-10-01T00:00:00.000Z" })]],
    });
    const store = new SupabaseLineageStore();
    const list = await store.list();
    expect(list.map((r) => r.id)).toEqual(["bc_26I21-14_26I21-16"]);
    const result = await store.reverse({ id: "bc_26I21-14_26I21-16", actor: "gm", reason: "wrong lot" });
    expect(result.auditStored).toBe(true);
    expect(result.conversion.reversedBy).toBe("gm");
    expect(result.conversion.reversalReason).toBe("wrong lot");
    expect(result.audit.action).toBe("reversed");
  });

  test("missing reversal columns are unavailable and name the migration", async () => {
    fakeClient({
      rowsByRead: [[existing(120)]],
      updateError: { code: "42703", message: 'column "reversed_at" does not exist' },
    });
    await expect(
      new SupabaseLineageStore().reverse({ id: "bc_26I21-14_26I21-16", actor: "gm", reason: "wrong lot" }),
    ).rejects.toThrow(/20261031120000_batch_conversion_reversal/);
    await expect(
      new SupabaseLineageStore().reverse({ id: "bc_26I21-14_26I21-16", actor: "gm", reason: "wrong lot" }),
    ).rejects.toThrow(/Nothing was changed/);
  });

  test("a failed audit insert keeps the reversal and reports that the audit was not stored", async () => {
    fakeClient({
      rowsByRead: [[existing(120)]],
      auditInsertError: { code: "42P01", message: 'relation "batch_conversion_audits" does not exist' },
    });
    const result = await new SupabaseLineageStore().reverse({
      id: "bc_26I21-14_26I21-16",
      actor: "gm",
      reason: "wrong lot",
    });
    expect(result.auditStored).toBe(false);
    expect(result.conversion.reversedAt).toBeTruthy();
    expect(console.warn).toHaveBeenCalled();
  });
});

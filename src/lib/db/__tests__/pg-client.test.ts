// Unit tests for the pg-backed supabase-shaped query builder. These exercise the
// SQL + params GENERATION (and result shaping) by driving the builder against a
// mock pool that captures the last query — no real database needed.

import { createPgClient, type PgClient } from "../pg-client";

interface Captured {
  sql: string;
  params: unknown[];
}

function mockPool(rows: Record<string, unknown>[] = []) {
  const calls: Captured[] = [];
  const pool = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows, rowCount: rows.length };
    }),
  };
  return { pool, calls };
}

function setup(rows: Record<string, unknown>[] = []): {
  db: PgClient;
  calls: Captured[];
} {
  const { pool, calls } = mockPool(rows);
  return { db: createPgClient(pool), calls };
}

describe("pg-client query builder — SQL generation", () => {
  it("select with eq + order + range", async () => {
    const { db, calls } = setup([{ id: "a" }]);
    await db
      .from("sessions")
      .select("id, title")
      .eq("device_id", "dev-1")
      .order("created_at", { ascending: false })
      .range(0, 19);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toBe(
      'SELECT "id", "title" FROM "sessions" WHERE "device_id" = $1 ORDER BY "created_at" DESC LIMIT $2 OFFSET $3',
    );
    expect(calls[0].params).toEqual(["dev-1", 20, 0]);
  });

  it("select('*') emits SELECT *", async () => {
    const { db, calls } = setup([]);
    await db.from("events").select("*").eq("event_type", "correction");
    expect(calls[0].sql).toBe(
      'SELECT * FROM "events" WHERE "event_type" = $1',
    );
    expect(calls[0].params).toEqual(["correction"]);
  });

  it("select with embedded relation/aggregate clause is reduced to SELECT *", async () => {
    const { db, calls } = setup([]);
    await db
      .from("sessions")
      .select("id, title, insight_slides(count)")
      .eq("device_id", "d");
    // The embed token is dropped; remaining plain cols are kept.
    expect(calls[0].sql).toBe(
      'SELECT "id", "title" FROM "sessions" WHERE "device_id" = $1',
    );
  });

  it("in() generates a parameterized IN list", async () => {
    const { db, calls } = setup([]);
    await db.from("events").select("event_id").in("event_id", ["x", "y", "z"]);
    expect(calls[0].sql).toBe(
      'SELECT "event_id" FROM "events" WHERE "event_id" IN ($1, $2, $3)',
    );
    expect(calls[0].params).toEqual(["x", "y", "z"]);
  });

  it("in() with empty array matches nothing (FALSE)", async () => {
    const { db, calls } = setup([]);
    await db.from("events").select("*").in("event_id", []);
    expect(calls[0].sql).toBe('SELECT * FROM "events" WHERE FALSE');
    expect(calls[0].params).toEqual([]);
  });

  it("insert generates parameterized VALUES", async () => {
    const { db, calls } = setup([]);
    await db.from("findings").insert({ finding_id: "f1", severity: "warning" });
    expect(calls[0].sql).toBe(
      'INSERT INTO "findings" ("finding_id", "severity") VALUES ($1, $2)',
    );
    expect(calls[0].params).toEqual(["f1", "warning"]);
  });

  it("multi-row insert shares one column list", async () => {
    const { db, calls } = setup([]);
    await db.from("events").insert([
      { event_id: "a", event_type: "rejection" },
      { event_id: "b", event_type: "rejection" },
    ]);
    expect(calls[0].sql).toBe(
      'INSERT INTO "events" ("event_id", "event_type") VALUES ($1, $2), ($3, $4)',
    );
    expect(calls[0].params).toEqual(["a", "rejection", "b", "rejection"]);
  });

  it("upsert with onConflict emits ON CONFLICT DO UPDATE for non-conflict cols", async () => {
    const { db, calls } = setup([]);
    await db
      .from("registries")
      .upsert(
        { client_id: "disposafe", registry_version: "1.0.0", stages: [{ id: "s1" }] },
        { onConflict: "client_id" },
      );
    expect(calls[0].sql).toBe(
      'INSERT INTO "registries" ("client_id", "registry_version", "stages") VALUES ($1, $2, $3) ' +
        'ON CONFLICT ("client_id") DO UPDATE SET "registry_version" = EXCLUDED."registry_version", "stages" = EXCLUDED."stages"',
    );
    // jsonb param is stringified.
    expect(calls[0].params).toEqual([
      "disposafe",
      "1.0.0",
      JSON.stringify([{ id: "s1" }]),
    ]);
  });

  it("upsert where every column is the conflict key → DO NOTHING", async () => {
    const { db, calls } = setup([]);
    await db.from("events").upsert({ event_id: "e1" }, { onConflict: "event_id" });
    expect(calls[0].sql).toBe(
      'INSERT INTO "events" ("event_id") VALUES ($1) ON CONFLICT ("event_id") DO NOTHING',
    );
  });

  it("insert followed by .select().single() RETURNs the column", async () => {
    const { db, calls } = setup([{ id: "new-id" }]);
    const res = await db
      .from("insight_slides")
      .insert({ session_id: "s1", question: "q" })
      .select("id")
      .single();
    expect(calls[0].sql).toBe(
      'INSERT INTO "insight_slides" ("session_id", "question") VALUES ($1, $2) RETURNING "id"',
    );
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ id: "new-id" });
  });

  it("update with eq filter", async () => {
    const { db, calls } = setup([]);
    await db
      .from("sessions")
      .update({ dashboard: { a: 1 }, title: "T" })
      .eq("id", "s1");
    expect(calls[0].sql).toBe(
      'UPDATE "sessions" SET "dashboard" = $1, "title" = $2 WHERE "id" = $3',
    );
    expect(calls[0].params).toEqual([JSON.stringify({ a: 1 }), "T", "s1"]);
  });

  it("delete with in()", async () => {
    const { db, calls } = setup([]);
    await db.from("events").delete().in("event_id", ["a", "b"]);
    expect(calls[0].sql).toBe(
      'DELETE FROM "events" WHERE "event_id" IN ($1, $2)',
    );
    expect(calls[0].params).toEqual(["a", "b"]);
  });

  it("delete with neq", async () => {
    const { db, calls } = setup([]);
    await db
      .from("registries")
      .delete()
      .neq("client_id", "00000000-0000-0000-0000-000000000000");
    expect(calls[0].sql).toBe(
      'DELETE FROM "registries" WHERE "client_id" <> $1',
    );
  });

  it("limit() without range", async () => {
    const { db, calls } = setup([]);
    await db.from("sessions").select("*").limit(20);
    expect(calls[0].sql).toBe('SELECT * FROM "sessions" LIMIT $1');
    expect(calls[0].params).toEqual([20]);
  });
});

describe("pg-client result shaping", () => {
  it("single() errors when rowCount !== 1", async () => {
    const { db } = setup([]); // zero rows
    const res = await db.from("findings").select("*").eq("finding_id", "x").single();
    expect(res.data).toBeNull();
    expect(res.error).toBeInstanceOf(Error);
  });

  it("single() returns the row when exactly one", async () => {
    const { db } = setup([{ finding_id: "x" }]);
    const res = await db.from("findings").select("*").eq("finding_id", "x").single();
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ finding_id: "x" });
  });

  it("maybeSingle() returns null with no error on zero rows", async () => {
    const { db } = setup([]);
    const res = await db
      .from("registries")
      .select("*")
      .eq("client_id", "disposafe")
      .maybeSingle();
    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
  });

  it("maybeSingle() returns the first row when present", async () => {
    const { db } = setup([{ client_id: "disposafe" }]);
    const res = await db
      .from("registries")
      .select("*")
      .eq("client_id", "disposafe")
      .maybeSingle();
    expect(res.data).toEqual({ client_id: "disposafe" });
  });

  it("plain select returns data array", async () => {
    const { db } = setup([{ a: 1 }, { a: 2 }]);
    const res = await db.from("t").select("*");
    expect(res.error).toBeNull();
    expect(res.data).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("write without trailing select returns { data: null, error: null }", async () => {
    const { db } = setup([]);
    const res = await db.from("events").insert({ event_id: "e1" });
    expect(res).toEqual({ data: null, error: null });
  });
});

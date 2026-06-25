// src/lib/db/pg-client.ts
//
// A minimal, supabase-js-shaped query builder backed by a plain Postgres `pg`
// Pool. Stage B of the on-prem migration: the app's stores and routes keep
// calling `.from(table).select(...).eq(...)…` exactly as they did against
// Supabase, but the calls now generate parameterized SQL and run against a
// local Postgres instance pointed at by `DATABASE_URL`.
//
// Only the subset of the supabase-js builder that the codebase actually uses is
// implemented (verified by grep across src):
//   select, insert, upsert, update, delete,
//   eq, neq, in, order, range, limit, single, maybeSingle,
//   and a trailing `.select()` after insert/upsert to RETURN rows.
//
// The builder is THENABLE — `await db.from("t").select("*").eq(...)` resolves to
// `{ data, error }`, matching supabase-js. `error` is null on success; on
// failure `data` is null and `error` carries the thrown Error.

import { Pool, type QueryResult } from "pg";

let _pool: Pool | null = null;

/** Process-singleton connection pool built from DATABASE_URL. */
export function getPool(): Pool {
  if (_pool) return _pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  _pool = new Pool({ connectionString });
  return _pool;
}

/** Small escape hatch: run raw parameterized SQL against the pool. */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(sql, params);
}

export interface PgResult<T = Record<string, unknown>> {
  data: T[] | T | null;
  error: Error | null;
}

// Minimal pool surface the builder needs. Loose enough that tests can supply a
// mock returning just `{ rows }`.
type Poolish = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

// jsonb-safe param coercion: node-pg serializes a JS object/array bound to a
// jsonb column fine, but to be explicit and avoid "invalid input syntax"
// ambiguity we stringify any non-null object/array param ourselves. Scalars,
// null, Buffers and Dates pass through untouched.
function coerceParam(v: unknown): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Date) return v;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function quoteIdent(id: string): string {
  // Identifiers in this codebase are snake_case column/table names. Quote them
  // defensively so reserved-ish names work; reject anything unexpected.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    throw new Error(`Unsafe identifier: ${id}`);
  }
  return `"${id}"`;
}

// Parse a supabase select() column spec into plain column identifiers. We ignore
// PostgREST embedding/aggregate clauses like `insight_slides(count)` — they are
// not consumed downstream — and treat `*` (with or without extra cols) as
// SELECT *.
function parseSelectCols(cols: string): string {
  const trimmed = cols.trim();
  if (trimmed === "" || trimmed === "*") return "*";
  // Split on top-level commas only (depth 0); skip any token containing "(" — an
  // embedded relation/aggregate that has no plain-SQL equivalent here.
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of trimmed) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) parts.push(cur);

  const plain = parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.includes("("));
  if (plain.length === 0 || plain.includes("*")) return "*";
  return plain.map((c) => quoteIdent(c)).join(", ");
}

interface Filter {
  op: "eq" | "neq" | "in";
  col: string;
  val: unknown;
}

interface OrderClause {
  col: string;
  ascending: boolean;
}

type Mode = "select" | "insert" | "upsert" | "update" | "delete";

class QueryBuilder<T = Record<string, unknown>> implements PromiseLike<PgResult<T>> {
  private mode: Mode = "select";
  private selectCols = "*";
  private filters: Filter[] = [];
  private orderBy: OrderClause[] = [];
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private limitN: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;
  private returning = false; // trailing .select() after insert/upsert/update

  private writeRows: Record<string, unknown>[] = [];
  private updateValues: Record<string, unknown> | null = null;
  private onConflictCol: string | null = null;

  constructor(
    private pool: Poolish,
    private table: string,
  ) {}

  select(cols = "*"): this {
    if (this.mode === "select") {
      this.selectCols = parseSelectCols(cols);
    } else {
      // Trailing .select() after a write → RETURNING.
      this.returning = true;
      this.selectCols = parseSelectCols(cols);
    }
    return this;
  }

  insert(rowsOrRow: Record<string, unknown> | Record<string, unknown>[]): this {
    this.mode = "insert";
    this.writeRows = Array.isArray(rowsOrRow) ? rowsOrRow : [rowsOrRow];
    return this;
  }

  upsert(
    rowsOrRow: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string },
  ): this {
    this.mode = "upsert";
    this.writeRows = Array.isArray(rowsOrRow) ? rowsOrRow : [rowsOrRow];
    this.onConflictCol = opts?.onConflict ?? null;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.mode = "update";
    this.updateValues = values;
    return this;
  }

  delete(): this {
    this.mode = "delete";
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push({ op: "eq", col, val });
    return this;
  }

  neq(col: string, val: unknown): this {
    this.filters.push({ op: "neq", col, val });
    return this;
  }

  in(col: string, arr: unknown[]): this {
    this.filters.push({ op: "in", col, val: arr });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy.push({ col, ascending: opts?.ascending !== false });
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  single(): this {
    this.singleMode = "single";
    return this;
  }

  maybeSingle(): this {
    this.singleMode = "maybeSingle";
    return this;
  }

  // ── SQL generation ─────────────────────────────────────────────────────────

  /** Exposed for unit tests: produce the SQL string + ordered params. */
  buildSql(): { sql: string; params: unknown[] } {
    switch (this.mode) {
      case "select":
        return this.buildSelect();
      case "insert":
      case "upsert":
        return this.buildInsert();
      case "update":
        return this.buildUpdate();
      case "delete":
        return this.buildDelete();
    }
  }

  private buildWhere(params: unknown[]): string {
    if (this.filters.length === 0) return "";
    const clauses = this.filters.map((f) => {
      if (f.op === "in") {
        const arr = (f.val as unknown[]) ?? [];
        if (arr.length === 0) {
          // `IN ()` is invalid SQL; an empty IN matches nothing.
          return "FALSE";
        }
        const placeholders = arr.map((v) => {
          params.push(coerceParam(v));
          return `$${params.length}`;
        });
        return `${quoteIdent(f.col)} IN (${placeholders.join(", ")})`;
      }
      params.push(coerceParam(f.val));
      const op = f.op === "eq" ? "=" : "<>";
      return `${quoteIdent(f.col)} ${op} $${params.length}`;
    });
    return ` WHERE ${clauses.join(" AND ")}`;
  }

  private buildSelect(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    let sql = `SELECT ${this.selectCols} FROM ${quoteIdent(this.table)}`;
    sql += this.buildWhere(params);

    if (this.orderBy.length > 0) {
      const parts = this.orderBy.map(
        (o) => `${quoteIdent(o.col)} ${o.ascending ? "ASC" : "DESC"}`,
      );
      sql += ` ORDER BY ${parts.join(", ")}`;
    }

    if (this.rangeFrom !== null && this.rangeTo !== null) {
      // supabase range is inclusive [from, to].
      const count = this.rangeTo - this.rangeFrom + 1;
      params.push(count);
      sql += ` LIMIT $${params.length}`;
      params.push(this.rangeFrom);
      sql += ` OFFSET $${params.length}`;
    } else if (this.limitN !== null) {
      params.push(this.limitN);
      sql += ` LIMIT $${params.length}`;
    }

    return { sql, params };
  }

  private buildInsert(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    if (this.writeRows.length === 0) {
      throw new Error("insert/upsert called with no rows");
    }
    // Column set = union of keys across rows, ordered by first row's key order
    // then any extra keys. In practice all rows share a shape.
    const cols: string[] = [];
    const seen = new Set<string>();
    for (const row of this.writeRows) {
      for (const k of Object.keys(row)) {
        if (!seen.has(k)) {
          seen.add(k);
          cols.push(k);
        }
      }
    }

    const valueTuples = this.writeRows.map((row) => {
      const placeholders = cols.map((c) => {
        params.push(coerceParam(row[c] ?? null));
        return `$${params.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    const colList = cols.map((c) => quoteIdent(c)).join(", ");
    let sql = `INSERT INTO ${quoteIdent(this.table)} (${colList}) VALUES ${valueTuples.join(
      ", ",
    )}`;

    if (this.mode === "upsert") {
      const conflict = this.onConflictCol;
      if (conflict) {
        const conflictCols = conflict.split(",").map((c) => quoteIdent(c.trim()));
        const updates = cols
          .filter((c) => !conflict.split(",").map((x) => x.trim()).includes(c))
          .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`);
        if (updates.length > 0) {
          sql += ` ON CONFLICT (${conflictCols.join(", ")}) DO UPDATE SET ${updates.join(", ")}`;
        } else {
          sql += ` ON CONFLICT (${conflictCols.join(", ")}) DO NOTHING`;
        }
      } else {
        sql += ` ON CONFLICT DO NOTHING`;
      }
    }

    if (this.returning) {
      sql += ` RETURNING ${this.selectCols}`;
    }

    return { sql, params };
  }

  private buildUpdate(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    if (!this.updateValues) throw new Error("update called with no values");
    const cols = Object.keys(this.updateValues);
    const setParts = cols.map((c) => {
      params.push(coerceParam(this.updateValues![c] ?? null));
      return `${quoteIdent(c)} = $${params.length}`;
    });
    let sql = `UPDATE ${quoteIdent(this.table)} SET ${setParts.join(", ")}`;
    sql += this.buildWhere(params);
    if (this.returning) sql += ` RETURNING ${this.selectCols}`;
    return { sql, params };
  }

  private buildDelete(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    let sql = `DELETE FROM ${quoteIdent(this.table)}`;
    sql += this.buildWhere(params);
    if (this.returning) sql += ` RETURNING ${this.selectCols}`;
    return { sql, params };
  }

  // ── Execution (thenable) ─────────────────────────────────────────────────────

  private async run(): Promise<PgResult<T>> {
    try {
      const { sql, params } = this.buildSql();
      const res = await this.pool.query(sql, params);
      const rows = (res.rows ?? []) as T[];

      // Writes with no trailing .select() return no data (like supabase).
      const isWrite = this.mode !== "select";
      if (isWrite && !this.returning) {
        return { data: null, error: null };
      }

      if (this.singleMode === "single") {
        if (rows.length !== 1) {
          return {
            data: null,
            error: new Error(
              `single() expected exactly 1 row, got ${rows.length}`,
            ),
          };
        }
        return { data: rows[0], error: null };
      }
      if (this.singleMode === "maybeSingle") {
        return { data: rows.length > 0 ? rows[0] : null, error: null };
      }

      return { data: rows, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  then<TResult1 = PgResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: PgResult<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export interface PgClient {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
}

/** supabase-js-shaped client backed by the pg Pool. */
export function createPgClient(pool: Poolish = getPool()): PgClient {
  return {
    from<T = Record<string, unknown>>(table: string) {
      return new QueryBuilder<T>(pool, table);
    },
  };
}

// Exposed for tests that want to drive the builder against a mock pool.
export { QueryBuilder };

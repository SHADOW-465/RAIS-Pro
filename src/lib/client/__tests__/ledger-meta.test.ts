import { QueryClient } from "@tanstack/react-query";
import { invalidateAfterWrite, queryKeysForWrite } from "../invalidate";
import { INITIAL_META_STATE, metaStep, readingFrom, type MetaReading, type MetaState } from "../ledger-meta";

const v = (version: number): MetaReading => ({ kind: "version", version });

/** Feed readings through metaStep; return which ones asked for a reload. */
function run(readings: MetaReading[]): { invalidated: boolean[]; state: MetaState; stopped: boolean } {
  let state = INITIAL_META_STATE;
  let stopped = false;
  const invalidated = readings.map((r) => {
    const step = metaStep(state, r);
    state = step.state;
    stopped = stopped || step.stop;
    return step.invalidate;
  });
  return { invalidated, state, stopped };
}

describe("metaStep", () => {
  test("the first reading is a baseline, not a change", () => {
    expect(run([v(5)]).invalidated).toEqual([false]);
  });

  test("a moved counter reloads once; an unchanged one does not", () => {
    expect(run([v(5), v(5), v(6), v(6), v(9)]).invalidated).toEqual([false, false, true, false, true]);
  });

  test("a counter that went back (database reset) still reloads", () => {
    expect(run([v(9), v(2)]).invalidated).toEqual([false, true]);
  });

  test("without the migration the first tick is quiet, then every tick reloads", () => {
    const un: MetaReading = { kind: "unavailable" };
    expect(run([un, un, un]).invalidated).toEqual([false, true, true]);
  });

  test("a counter appearing after an unavailable spell reloads once", () => {
    const un: MetaReading = { kind: "unavailable" };
    expect(run([un, v(3), v(3)]).invalidated).toEqual([false, true, false]);
  });

  test("a network error learns nothing and keeps the baseline", () => {
    const err: MetaReading = { kind: "error" };
    expect(run([v(5), err, v(5)]).invalidated).toEqual([false, false, false]);
    expect(run([v(5), err, v(6)]).invalidated).toEqual([false, false, true]);
  });

  test("a lost session stops the poll and reloads nothing", () => {
    const out = run([v(5), { kind: "signed-out" }]);
    expect(out.stopped).toBe(true);
    expect(out.invalidated).toEqual([false, false]);
  });
});

describe("readingFrom", () => {
  const res = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

  test("maps the endpoint's answers", async () => {
    expect(await readingFrom(res(200, { version: 12 }))).toEqual({ kind: "version", version: 12 });
    expect(await readingFrom(res(503, { version: null }))).toEqual({ kind: "unavailable" });
    expect(await readingFrom(res(401))).toEqual({ kind: "signed-out" });
    expect(await readingFrom(res(403))).toEqual({ kind: "signed-out" });
    expect(await readingFrom(res(500))).toEqual({ kind: "error" });
  });

  test("a 200 with no usable number is unavailable, never a fake version", async () => {
    expect(await readingFrom(res(200, { version: null }))).toEqual({ kind: "unavailable" });
    expect(await readingFrom(res(200, {}))).toEqual({ kind: "unavailable" });
    expect(await readingFrom(res(200))).toEqual({ kind: "unavailable" });
  });
});

describe("remote invalidation", () => {
  test("drops every business cache, same set as clear-data", () => {
    expect(queryKeysForWrite("remote")).toEqual(queryKeysForWrite("clear-data"));
  });

  test("invalidates each key as a prefix", async () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    await invalidateAfterWrite("remote", client);
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(["events", "ledger-bounds", "plant-totals", "schema", "capa", "workbooks"]));
  });
});

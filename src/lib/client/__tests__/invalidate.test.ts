import { QueryClient } from "@tanstack/react-query";
import { createAppQueryClient } from "../query-client";
import { EVENTS_STALE_MS } from "../ledger-window";
import { invalidateAfterWrite, queryKeysForWrite, type WriteKind } from "../invalidate";

describe("queryKeysForWrite", () => {
  test("entries and events share the ledger keys", () => {
    expect(queryKeysForWrite("entries")).toEqual(queryKeysForWrite("events"));
    expect(queryKeysForWrite("events")).toEqual([["events"], ["ledger-bounds"]]);
  });

  test("each write kind names the caches it changes", () => {
    const keys = (kind: WriteKind) => queryKeysForWrite(kind).map((k) => k[0]);
    expect(keys("schema")).toEqual(["schema"]);
    expect(keys("conversions")).toEqual(["conversions"]);
    expect(keys("capa")).toEqual(["capa"]);
    expect(keys("presets")).toEqual(["presets"]);
    expect(keys("grants")).toEqual(["grants"]);
    expect(keys("roles")).toEqual(["roles", "users"]);
    expect(keys("workbooks")).toEqual(["workbooks", "events", "ledger-bounds"]);
    expect(keys("clear-data")).toEqual([
      "events",
      "ledger-bounds",
      "schema",
      "conversions",
      "capa",
      "presets",
      "grants",
      "roles",
      "users",
      "workbooks",
    ]);
  });
});

describe("invalidateAfterWrite", () => {
  test("does nothing when no query client is bound", async () => {
    await expect(invalidateAfterWrite("events", null)).resolves.toBeUndefined();
    await expect(invalidateAfterWrite("clear-data")).resolves.toBeUndefined();
  });

  test("invalidates every key for the write, as a prefix", async () => {
    const client = new QueryClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    await invalidateAfterWrite("workbooks", client);
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      { queryKey: ["workbooks"] },
      { queryKey: ["events"] },
      { queryKey: ["ledger-bounds"] },
    ]);
  });
});

describe("createAppQueryClient", () => {
  test("keeps a focused window from refetching the ledger", () => {
    const client = createAppQueryClient();
    const queries = client.getDefaultOptions().queries;
    expect(queries?.refetchOnWindowFocus).toBe(false);
    expect(queries?.staleTime).toBe(EVENTS_STALE_MS);
    expect(EVENTS_STALE_MS).toBeGreaterThan(0);
  });
});

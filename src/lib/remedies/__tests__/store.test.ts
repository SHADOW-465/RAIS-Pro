process.env.MOID_STORE = "memory";

import { calculatePareto } from "@/lib/analytics/pareto";
import {
  __resetRemedyStoreForTests,
  getRemedyStore,
  RemedyConflictError,
  type RemedyRow,
} from "../store";

function row(over: Partial<RemedyRow> = {}): RemedyRow {
  const now = "2026-11-02T00:00:00.000Z";
  return {
    code: "BIC",
    defectName: "Bend In Catheter",
    description: "Catheter bent at forming.",
    remedy: "Check mandrel alignment.",
    createdAt: now,
    createdBy: "gm",
    updatedAt: now,
    updatedBy: "gm",
    version: 1,
    ...over,
  };
}

beforeEach(() => {
  __resetRemedyStoreForTests();
});

test("a second save for the same code updates the one plant-book row", async () => {
  const store = getRemedyStore();
  await store.saveDefect("default", row());
  const second = await store.saveDefect(
    "default",
    row({ description: "Updated cause.", remedy: "Updated action.", updatedBy: "gm-2" }),
  );
  const codes = Object.keys(second.book.defects);
  expect(codes).toEqual(["BIC"]);
  expect(second.book.defects.BIC.description).toBe("Updated cause.");
  expect(second.book.defects.BIC.remedy).toBe("Updated action.");
  expect(second.book.defects.BIC.createdBy).toBe("gm");
  expect(second.book.defects.BIC.updatedBy).toBe("gm-2");
  expect(second.book.defects.BIC.version).toBe(2);
});

test("stale expectedVersion is a conflict and does not overwrite", async () => {
  const store = getRemedyStore();
  await store.saveDefect("default", row());
  await store.saveDefect("default", row({ description: "Latest.", remedy: "Latest action." }));
  await expect(
    store.saveDefect("default", row({ description: "Stale.", remedy: "Stale action." }), 1),
  ).rejects.toBeInstanceOf(RemedyConflictError);
  const read = await store.read("default");
  expect(read.book.defects.BIC.description).toBe("Latest.");
  expect(read.book.defects.BIC.version).toBe(2);
});

test("importIfEmpty writes only when the plant book is empty", async () => {
  const store = getRemedyStore();
  const incoming = {
    defects: {
      BIC: row(),
      SKIP: row({ code: "SKIP", description: "no remedy", remedy: "  " }),
    },
    trends: [],
  };
  const first = await store.importIfEmpty("default", incoming);
  expect(Object.keys(first.book.defects)).toEqual(["BIC"]);
  await store.saveDefect("default", row({ description: "Authoritative." }));
  const skipped = await store.importIfEmpty("default", {
    defects: { PS: row({ code: "PS", description: "Ply", remedy: "Dip" }) },
    trends: [],
  });
  expect(skipped.book.defects.BIC.description).toBe("Authoritative.");
  expect(skipped.book.defects.PS).toBeUndefined();
});

test("Pareto totals stay independent of remedy records", async () => {
  const series = [
    { label: "Bend In Catheter", value: 10 },
    { label: "Ply Separation", value: 5 },
  ];
  const before = calculatePareto(series);
  await getRemedyStore().saveDefect("default", row());
  const after = calculatePareto(series);
  expect(after).toEqual(before);
  expect(before?.totalDefects).toBe(15);
  expect(before?.items.map((i) => i.value)).toEqual([10, 5]);
});

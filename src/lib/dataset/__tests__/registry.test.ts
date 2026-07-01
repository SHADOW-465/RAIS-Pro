import { groupIntoDatasets } from "../registry";
import type { ProfiledTableInput } from "../types";
import type { SchemaSignature } from "@/lib/schema/types";

const sig = (hash: string): SchemaSignature => ({
  hash,
  columns: [
    { role: "dimension-date", name: "date" },
    { role: "measure", name: "qty" },
  ],
});
const input = (fileName: string, sheetName: string, hash: string, rowCount = 5): ProfiledTableInput => ({
  fileName, sheetName, signature: sig(hash), columns: [], rowCount,
});

describe("groupIntoDatasets", () => {
  it("collapses same-signature tables into one dataset with all sources", () => {
    const ds = groupIntoDatasets([
      input("apr.xlsx", "VISUAL", "aaaa", 10),
      input("may.xlsx", "VISUAL", "aaaa", 7),
    ]);
    expect(ds).toHaveLength(1);
    expect(ds[0].sources).toHaveLength(2);
    expect(ds[0].totalRows).toBe(17);
    expect(ds[0].id).toBe("aaaa");
  });

  it("keeps distinct signatures as distinct datasets", () => {
    const ds = groupIntoDatasets([input("a.xlsx", "S", "aaaa"), input("b.xlsx", "S", "bbbb")]);
    expect(ds).toHaveLength(2);
  });

  it("is order-independent (shuffled input → identical datasets)", () => {
    const a = [input("a.xlsx", "S1", "aaaa"), input("b.xlsx", "S2", "bbbb"), input("c.xlsx", "S3", "aaaa")];
    const b = [a[2], a[0], a[1]];
    expect(groupIntoDatasets(b)).toEqual(groupIntoDatasets(a));
  });

  it("keeps two different schemas separate even if their hash collides", () => {
    const sigA = { hash: "deadbeef", columns: [{ role: "measure" as const, name: "qty" }] };
    const sigB = { hash: "deadbeef", columns: [{ role: "measure" as const, name: "count" }] }; // same hash, different basis
    const a: ProfiledTableInput = { fileName: "a.xlsx", sheetName: "S", signature: sigA, columns: [], rowCount: 3 };
    const b: ProfiledTableInput = { fileName: "b.xlsx", sheetName: "S", signature: sigB, columns: [], rowCount: 4 };
    const ds = groupIntoDatasets([a, b]);
    expect(ds).toHaveLength(2);
    expect(new Set(ds.map((d) => d.id)).size).toBe(2); // ids must differ despite the same hash
  });
});

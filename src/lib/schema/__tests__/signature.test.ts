// src/lib/schema/__tests__/signature.test.ts
import { computeSignature, stableHash } from "@/lib/schema/signature";
import type { ColumnProfile } from "@/lib/schema/types";

const col = (name: string, role: ColumnProfile["role"]): ColumnProfile => ({
  name, role, index: 0, colLetter: "A", type: "number", formula: null,
});

describe("stableHash", () => {
  it("is deterministic and isomorphic (no crypto/fs)", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });
});

describe("computeSignature", () => {
  it("is identical for two tables with the same roles+names (different data months)", () => {
    const a = [col("DATE", "dimension-date"), col("QUANTITY CHECKED", "measure"), col("%", "derived")];
    const b = [col("DATE", "dimension-date"), col("QUANTITY CHECKED", "measure"), col("%", "derived")];
    expect(computeSignature(a).hash).toBe(computeSignature(b).hash);
  });

  it("differs when a column role differs", () => {
    const a = [col("X", "measure")];
    const b = [col("X", "derived")];
    expect(computeSignature(a).hash).not.toBe(computeSignature(b).hash);
  });

  it("ignores meta columns so remarks/serials don't fragment the signature", () => {
    const withMeta = [col("DATE", "dimension-date"), col("REMARKS", "meta"), col("QTY", "measure")];
    const without = [col("DATE", "dimension-date"), col("QTY", "measure")];
    expect(computeSignature(withMeta).hash).toBe(computeSignature(without).hash);
  });
});

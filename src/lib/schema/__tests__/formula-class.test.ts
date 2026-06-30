// src/lib/schema/__tests__/formula-class.test.ts
import { classifyFormula } from "@/lib/schema/formula-class";

describe("classifyFormula", () => {
  it("returns none for no formula", () => {
    expect(classifyFormula(null, "B", 9)).toEqual({ kind: "none" });
  });

  it("classifies a cross-file/sheet link as external-link (NOT derived)", () => {
    // QUANTITY CHECKED in the analytical files is a formula but a RAW value.
    const r = classifyFormula("'[3]APRIL 25'!B9", "B", 9);
    expect(r.kind).toBe("external-link");
  });

  it("classifies a same-sheet cross reference with ! as external-link", () => {
    const r = classifyFormula("'APRIL 25'!B9", "B", 9);
    expect(r.kind).toBe("external-link");
  });

  it("classifies a vertical SUM range as vertical-aggregate", () => {
    const r = classifyFormula("SUM(B6:B10)", "B", 11);
    expect(r.kind).toBe("vertical-aggregate");
  });

  it("classifies a same-row sibling formula as row-derived", () => {
    // REJ% = F/C*100 in cell G9
    const r = classifyFormula("F9/C9*100", "G", 9);
    expect(r).toEqual({ kind: "row-derived", refs: expect.arrayContaining(["F", "C"]) });
  });

  it("classifies REJ QTY = C-(D+E) as row-derived, excluding self", () => {
    const r = classifyFormula("C9-(D9+E9)", "F", 9);
    expect(r.kind).toBe("row-derived");
    if (r.kind === "row-derived") {
      expect(r.refs.sort()).toEqual(["C", "D", "E"]);
    }
  });

  it("ignores a leading equals sign", () => {
    expect(classifyFormula("=SUM(B6:B10)", "B", 11).kind).toBe("vertical-aggregate");
  });

  it("classifies a same-row horizontal SUM range as row-derived", () => {
    expect(classifyFormula("SUM(D9:O9)", "P", 9).kind).toBe("row-derived");
  });

  it("still classifies a multi-row single-column SUM as vertical-aggregate", () => {
    expect(classifyFormula("SUM(B6:B10)", "B", 11).kind).toBe("vertical-aggregate");
  });
});

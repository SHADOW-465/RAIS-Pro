// src/lib/schema/__tests__/profile.test.ts
import { profileTable } from "@/lib/schema/profile";
import type { ProfilingTable, ProfilingCell } from "@/lib/schema/types";

const cell = (value: unknown, formula: string | null = null): ProfilingCell => ({ value, formula });

// Helper: build a table from a header + array of row arrays of ProfilingCells.
function table(header: string[], colLetters: string[], rows: ProfilingCell[][]): ProfilingTable {
  return { sheetName: "T", header, colLetters, firstDataRow: 9, rows };
}

describe("profileTable", () => {
  it("keeps a formula-LINKED quantity column as a measure (regression guard)", () => {
    // The exact bug: QUANTITY CHECKED is filled by ='[3]APRIL 25'!B9 — a formula,
    // but a raw count. It must be a measure, never derived, never dropped.
    const t = table(
      ["DATE", "QUANTITY CHECKED", "REJECTION", "%"],
      ["A", "B", "C", "D"],
      [
        [cell("2025-04-01"), cell(10982, "'[3]APRIL 25'!B9"), cell(1054, "'[3]APRIL 25'!E9"), cell(9.6, "C9/B9*100")],
        [cell("2025-04-02"), cell(11054, "'[3]APRIL 25'!B10"), cell(828, "'[3]APRIL 25'!E10"), cell(7.5, "C10/B10*100")],
      ],
    );
    const { columns } = profileTable(t);
    const byName = Object.fromEntries(columns.map((c) => [c.name, c.role]));
    expect(byName["QUANTITY CHECKED"]).toBe("measure");
    expect(byName["REJECTION"]).toBe("measure");
    expect(byName["%"]).toBe("derived");
    expect(byName["DATE"]).toBe("dimension-date");
  });

  it("classifies a row-derived total column as derived", () => {
    const t = table(
      ["DATE", "VISUAL QTY", "TOTAL REJ QTY"],
      ["A", "B", "P"],
      [
        [cell("2025-04-01"), cell(10982), cell(2646, "D9+H9+L9+O9")],
      ],
    );
    const { columns } = profileTable(t);
    expect(columns.find((c) => c.name === "TOTAL REJ QTY")!.role).toBe("derived");
    expect(columns.find((c) => c.name === "VISUAL QTY")!.role).toBe("measure");
  });

  it("classifies a short reason code with numeric values as a defect column", () => {
    const t = table(
      ["DATE", "REC. QTY", "COAG", "SD"],
      ["A", "C", "H", "I"],
      [
        [cell("2025-06-01"), cell(500), cell(3), cell(1)],
        [cell("2025-06-02"), cell(480), cell(0), cell(2)],
      ],
    );
    const { columns } = profileTable(t);
    expect(columns.find((c) => c.name === "COAG")!.role).toBe("defect");
    expect(columns.find((c) => c.name === "SD")!.role).toBe("defect");
    expect(columns.find((c) => c.name === "REC. QTY")!.role).toBe("measure");
  });

  it("classifies a low-cardinality text column as a dimension", () => {
    const t = table(
      ["BATCH", "REC. QTY"],
      ["A", "B"],
      [
        [cell("B-101"), cell(500)],
        [cell("B-102"), cell(480)],
      ],
    );
    const { columns } = profileTable(t);
    expect(columns.find((c) => c.name === "BATCH")!.role).toBe("dimension");
  });
});

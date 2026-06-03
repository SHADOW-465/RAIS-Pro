import {
  parseMonth,
  buildFileGroups,
  findColumn,
  findContributingSheets,
  quickStats,
  columnTotal,
  sheetNameOf,
} from "../lib/verify-nav";
import type { RawSheet } from "@/types/dashboard";

function sheet(name: string, columns: string[], rows: Record<string, unknown>[] = []): RawSheet {
  return { name, fileName: name.split(" - ")[0], columns, rows };
}

describe("parseMonth", () => {
  it("parses 'APRIL 25' to April 2025", () => {
    expect(parseMonth("APRIL 25")).toMatchObject({ label: "April 2025", monthIndex: 3, year: 2025 });
  });
  it("parses 'JANUARY 26' to January 2026", () => {
    expect(parseMonth("JANUARY 26")).toMatchObject({ label: "January 2026", monthIndex: 0, year: 2026 });
  });
  it("orders chronologically across the year boundary", () => {
    const dec = parseMonth("DECEMBER 25")!.sortIndex;
    const jan = parseMonth("JANUARY 26")!.sortIndex;
    expect(jan).toBeGreaterThan(dec);
  });
  it("returns null for non-month sheets", () => {
    expect(parseMonth("YEARLY 2024-25")).toBeNull();
    expect(parseMonth("FORMATE")).toBeNull();
    expect(parseMonth("4-2-25")).toBeNull();
  });
});

describe("sheetNameOf", () => {
  it("strips the file prefix", () => {
    expect(sheetNameOf("VISUAL INSPECTION REPORT 2025.xlsx - APRIL 25")).toBe("APRIL 25");
  });
});

describe("buildFileGroups", () => {
  const file = "VISUAL INSPECTION REPORT 2025.xlsx";
  const sheets: RawSheet[] = [
    sheet(`${file} - FORMATE`, ["B.NO"]),
    sheet(`${file} - MAY 25`, ["REC. QTY"]),
    sheet(`${file} - APRIL 25`, ["REC. QTY"]),
    sheet(`${file} - YEARLY 2024-25`, ["MONTH"]),
  ];

  it("classifies and chronologically orders months, segregates summary/other", () => {
    const [g] = buildFileGroups(sheets);
    expect(g.fileName).toBe(file);
    expect(g.months.map((m) => m.label)).toEqual(["April 2025", "May 2025"]);
    expect(g.summaries.map((s) => s.sheetName)).toEqual(["YEARLY 2024-25"]);
    expect(g.others.map((s) => s.sheetName)).toEqual(["FORMATE"]);
    // ordered = months → summaries → others
    expect(g.ordered.map((e) => e.kind)).toEqual(["month", "month", "summary", "other"]);
  });

  it("keeps distinct files as separate groups", () => {
    const multi = [...sheets, sheet("OTHER.xlsx - APRIL 25", ["REC. QTY"])];
    const groups = buildFileGroups(multi);
    expect(groups.map((g) => g.fileName).sort()).toEqual(["OTHER.xlsx", file]);
  });

  it("marks merge-plan-excluded sheets", () => {
    const [g] = buildFileGroups(sheets, {
      groups: [],
      excludedSheets: [{ sheet: `${file} - YEARLY 2024-25`, reason: "rollup" }],
      crossFileStrategy: "sum",
      warnings: [],
    });
    expect(g.summaries[0].excluded).toBe(true);
    expect(g.summaries[0].excludedReason).toBe("rollup");
  });
});

describe("findColumn / findContributingSheets", () => {
  it("matches columns fuzzily (case/space/punct insensitive)", () => {
    expect(findColumn("rec qty", ["REC. QTY", "REJ. QTY"])).toBe("REC. QTY");
  });
  it("finds every sheet that contains the source column", () => {
    const sheets = [
      sheet("F - APRIL 25", ["REC. QTY", "REJ. QTY"]),
      sheet("F - MAY 25", ["REC. QTY"]),
      sheet("F - YEARLY", ["MONTH"]),
    ];
    expect(findContributingSheets(sheets, "REC. QTY")).toEqual([0, 1]);
  });
});

describe("quickStats / columnTotal", () => {
  const s = sheet("F - APRIL 25", ["REC. QTY", "REJ. QTY"], [
    { "REC. QTY": 100, "REJ. QTY": 10 },
    { "REC. QTY": 200, "REJ. QTY": 20 },
    { "REC. QTY": "HOLIDAY", "REJ. QTY": 0 },
  ]);
  it("sums received/rejected and computes rate, ignoring text", () => {
    const st = quickStats(s);
    expect(st.received).toBe(300);
    expect(st.rejected).toBe(30);
    expect(st.rate).toBeCloseTo(0.1, 6);
  });
  it("columnTotal sums a specific column", () => {
    expect(columnTotal(s, "REC. QTY")).toBe(300);
  });
});

import { classifyRejectionSheets, toISODate } from "@/lib/ingest/from-rejection-sheets";
import { emitMany } from "@/lib/ingest/emit";
import { checkRecord } from "@/lib/entry/validate-entry";
import { MemoryEventStore } from "@/lib/store/memory";
import type { RawSheet } from "@/types/dashboard";

// Synthetic sheets shaped like the GM's REJECTION ANALYSIS workbook:
// one sheet per stage, columns DATE / QUANTITY CHECKED / REJECTION / %.
function visualSheet(): RawSheet {
  return {
    name: "VISUAL",
    fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx",
    columns: ["DATE", "QUANTITY CHECKED", "REJECTION", "%"],
    rows: [
      { DATE: "2025-04-01", "QUANTITY CHECKED": 10982, REJECTION: 1054, "%": 9.5975 },
      { DATE: "2025-04-02", "QUANTITY CHECKED": 11054, REJECTION: 828, "%": 7.4905 },
      { DATE: "2025-04-03", "QUANTITY CHECKED": 12039, REJECTION: 847, "%": 7.0355 },
    ],
  };
}
function valveSheet(): RawSheet {
  return {
    name: "VALVE INTEGRITY",
    fileName: "01 REJECTION ANALYSIS-APRIL 2025.xlsx",
    columns: ["DATE", "QUANTITY CHECKED", "REJECTION", "%"],
    rows: [{ DATE: "2025-04-01", "QUANTITY CHECKED": 9612, REJECTION: 129, "%": 1.342 }],
  };
}
function cumulativeSheet(): RawSheet {
  return { name: "Cummulative", fileName: "x.xlsx", columns: ["DATE", "Total Rejection %"], rows: [] };
}

describe("toISODate", () => {
  test("handles ISO strings, Date objects, and Excel serials", () => {
    expect(toISODate("2025-04-01")).toBe("2025-04-01");
    expect(toISODate(new Date("2025-04-01T00:00:00Z"))).toBe("2025-04-01");
    expect(toISODate(45748)).toBe("2025-04-01"); // serial
    expect(toISODate("")).toBeNull();
    expect(toISODate("not a date")).toBeNull();
  });
});

describe("classifyRejectionSheets", () => {
  test("maps stage-per-sheet, picks columns, builds records, skips summaries", () => {
    const { records, mappings, skipped } = classifyRejectionSheets(
      [visualSheet(), valveSheet(), cumulativeSheet()],
      "ing-test"
    );

    const visual = mappings.find((m) => m.stageId === "visual")!;
    expect(visual.checkedColumn).toBe("QUANTITY CHECKED");
    expect(visual.rejectedColumn).toBe("REJECTION");
    expect(visual.pctColumn).toBe("%");
    expect(visual.dayCount).toBe(3);
    expect(visual.status).toBe("ok");

    expect(mappings.find((m) => m.stageId === "valve-integrity")!.dayCount).toBe(1);
    expect(skipped.map((s) => s.sheet)).toContain("Cummulative");

    // 3 visual + 1 valve days, each → production + inspection + claim
    expect(records.length).toBe(4);
  });

  test("full chain: classify → emit → store, idempotent re-ingest", async () => {
    const sheets = [visualSheet(), valveSheet()];
    const { records } = classifyRejectionSheets(sheets, "ing-1");
    const events = emitMany(records);
    // 4 day-records × (production + inspection + aggregate-claim) = 12
    expect(events.length).toBe(12);

    const store = new MemoryEventStore();
    const first = await store.append(events);
    expect(first.inserted).toBe(12);

    // re-ingest the same file → same content hashes → all deduped
    const second = await store.append(emitMany(classifyRejectionSheets(sheets, "ing-2").records));
    expect(second.inserted).toBe(0);
    expect(second.deduped).toBe(12);
  });

  test("live clarification catches an impossible row during ingest", () => {
    const bad = visualSheet();
    bad.rows.push({ DATE: "2025-04-04", "QUANTITY CHECKED": 100, REJECTION: 5000, "%": 5000 });
    const { records } = classifyRejectionSheets([bad], "ing-bad");
    const issues = records.flatMap(checkRecord);
    expect(issues.some((i) => i.code === "V-001")).toBe(true); // rejected > checked
  });
});

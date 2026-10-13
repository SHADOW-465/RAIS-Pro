import { defectAliasesOf, mergeDefectAliases, resolveDefectCode } from "../defect-alias";
import { byDefect } from "../defect";
import { reportCoverage } from "../report-coverage";
import type { Event } from "@/lib/store/types";

function rejection(raw: string, qty: number, code: string | null = null): Event {
  return {
    eventId: `e-${raw}-${qty}`,
    schemaVersion: "1.0.0",
    ingestionId: "i",
    eventType: "rejection",
    occurredOn: { kind: "day", start: "2026-08-01", end: "2026-08-01" },
    recordedAt: "2026-08-02T00:00:00.000Z",
    provenance: {
      file: "Manual Entry",
      fileHash: "h",
      sheet: "S",
      tableId: "t",
      cells: ["A1"],
      headerPath: [],
      rowLabel: null,
      formulaText: null,
      cachedValue: null,
      externalRef: null,
    },
    confidence: { score: 1, basis: "exact" },
    extractedBy: "direct-entry",
    supersededBy: null,
    stageId: "visual",
    defectCode: code,
    defectCodeRaw: raw,
    quantity: qty,
    unit: "pcs",
    batchNo: null,
    size: null,
    customFields: {},
  } as Event;
}

const registry = {
  stages: [],
  defects: [{ defectCode: "BM", label: "Black Mark", aliases: ["BM", "Black Mark"] }],
  sizes: [],
  fiscalYearStartMonth: 4,
  defectAliases: [{ key: "black marks", canonicalId: "DEFECT:BM" }],
};

test("a raw BM label resolves to the plant schema code", () => {
  const hit = resolveDefectCode(null, "BM", defectAliasesOf(registry));
  expect(hit).toEqual({ code: "BM", unresolved: false });
  const learned = resolveDefectCode(null, "Black Marks", defectAliasesOf(registry));
  expect(learned.code).toBe("BM");
});

test("an unknown raw label stays unresolved and is not dropped", () => {
  const hit = resolveDefectCode(null, "ZZZ-NOPE", defectAliasesOf(registry));
  expect(hit).toEqual({ code: null, unresolved: true });
  const rows = byDefect([rejection("ZZZ-NOPE", 4), rejection("BM", 9)], { grain: "month" }, registry);
  const unknown = rows.find((r) => r.label.includes("ZZZ-NOPE"));
  const known = rows.find((r) => r.defectCode === "BM");
  expect(unknown?.unresolved).toBe(true);
  expect(unknown?.rejected).toBe(4);
  expect(known?.label).toBe("Black Mark");
  expect(known?.unresolved).toBe(false);
  expect(known?.rejected).toBe(9);
});

test("coverage counts an alias match as resolved and leaves the event untouched", () => {
  const events = [rejection("BM", 10), rejection("ZZZ-NOPE", 5)];
  const cov = reportCoverage({
    included: events,
    missingEntryDate: [],
    outOfRange: [],
    dateFrom: "2026-04-01",
    dateTo: "2027-03-31",
    defectAliases: defectAliasesOf(registry),
  });
  expect(cov.resolvedDefectRejectedQty).toBe(10);
  expect(cov.unresolvedDefectRejectedQty).toBe(5);
  expect(events[0]).toMatchObject({ defectCode: null, defectCodeRaw: "BM" });
  expect(cov.statements.some((s) => s.includes("66.7%"))).toBe(true);
});

test("learned aliases attach without mutating the catalog array", () => {
  const defects = [{ defectCode: "BM", label: "Black Mark", aliases: ["BM"] }];
  const merged = mergeDefectAliases(defects, [{ key: "blackmark", canonicalId: "DEFECT:BM" }]);
  expect(defects[0].aliases).toEqual(["BM"]);
  expect(merged[0].aliases).toEqual(expect.arrayContaining(["BM", "blackmark"]));
});

import {
  periodKey,
  weekOfMonthBounds,
  fyContaining,
  scopeEvents,
  resolveScope,
  isDirectEntryEvent,
  listExcelSourceFiles,
  listBatchIds,
  eventBatchId,
  describeActiveScope,
  describeSourceFilter,
  isPlantDefaultTweaks,
  type Scope,
} from "../scope";
import { buildBatchId, parseBatchId } from "@/lib/entry/batch-id";
import { byStage } from "../rejection";
import type { Event } from "@/lib/store/types";

function makeEv(partial: {
  eventId: string;
  eventType?: Event["eventType"];
  stageId?: string;
  day?: string;
  qty?: number;
  file?: string;
  extractedBy?: string;
  disposition?: string;
  batchNo?: string | null;
}): Event {
  const day = partial.day ?? "2025-04-01";
  return {
    eventId: partial.eventId,
    schemaVersion: "1.0.0",
    ingestionId: "i",
    eventType: partial.eventType ?? "inspection",
    occurredOn: { kind: "day", start: day, end: day },
    provenance: {
      file: partial.file ?? "ASSEMBLY.xlsx",
      fileHash: "h",
      sheet: "S",
      tableId: "t1",
      cells: ["A1"],
      headerPath: [],
      rowLabel: null,
      formulaText: null,
      cachedValue: null,
      externalRef: null,
    },
    confidence: { score: 1, basis: "exact" },
    extractedBy: (partial.extractedBy as any) ?? "mod-extract",
    recordedAt: `${day}T00:00:00.000Z`,
    supersededBy: null,
    stageId: partial.stageId ?? "visual",
    size: "Fr14",
    quantity: partial.qty ?? 10,
    unit: "pcs",
    batchNo: partial.batchNo ?? null,
    disposition: partial.disposition ?? "rejected",
  } as unknown as Event;
}

describe("weekOfMonthBounds", () => {
  it("buckets days 1-7 of any month into week 1", () => {
    expect(weekOfMonthBounds(2026, 7, 1)).toEqual({ week: 1, startDay: 1, endDay: 7 });
    expect(weekOfMonthBounds(2026, 7, 7)).toEqual({ week: 1, startDay: 1, endDay: 7 });
  });

  it("buckets days 8-14 into week 2, etc.", () => {
    expect(weekOfMonthBounds(2026, 7, 8)).toEqual({ week: 2, startDay: 8, endDay: 14 });
    expect(weekOfMonthBounds(2026, 7, 14)).toEqual({ week: 2, startDay: 8, endDay: 14 });
  });

  it("clamps the last bucket's endDay to the real last day of a 31-day month", () => {
    // July 2026 has 31 days: buckets are 1-7, 8-14, 15-21, 22-28, 29-31 (short last bucket)
    expect(weekOfMonthBounds(2026, 7, 29)).toEqual({ week: 5, startDay: 29, endDay: 31 });
    expect(weekOfMonthBounds(2026, 7, 31)).toEqual({ week: 5, startDay: 29, endDay: 31 });
  });

  it("clamps the last bucket's endDay to the real last day of a 30-day month", () => {
    // June 2026 has 30 days: last bucket is 29-30 (2 days)
    expect(weekOfMonthBounds(2026, 6, 30)).toEqual({ week: 5, startDay: 29, endDay: 30 });
  });

  it("clamps the last bucket's endDay for February", () => {
    // Feb 2026 has 28 days: buckets are 1-7, 8-14, 15-21, 22-28 (exactly 4, no short one)
    expect(weekOfMonthBounds(2026, 2, 28)).toEqual({ week: 4, startDay: 22, endDay: 28 });
  });
});

describe("periodKey with grain 'week' (regression — must stay byte-identical)", () => {
  it("still produces the same key format after the weekOfMonthBounds extraction", () => {
    expect(periodKey("2026-07-01", "week")).toBe("2026-07-W1");
    expect(periodKey("2026-07-08", "week")).toBe("2026-07-W2");
    expect(periodKey("2026-07-31", "week")).toBe("2026-07-W5");
    expect(periodKey("2026-06-30", "week")).toBe("2026-06-W5");
  });
});

describe("fyContaining", () => {
  it("returns the FY containing a date in the second half of the calendar year (Apr-Dec)", () => {
    expect(fyContaining("2026-07-09")).toEqual({
      startYear: 2026,
      label: "FY2026-27",
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });

  it("returns the FY containing a date in the first quarter of the calendar year (Jan-Mar)", () => {
    expect(fyContaining("2027-02-15")).toEqual({
      startYear: 2026,
      label: "FY2026-27",
      from: "2026-04-01",
      to: "2027-03-31",
    });
  });

  it("agrees with periodKey's own FY label format", () => {
    expect(fyContaining("2026-07-09").label).toBe(periodKey("2026-07-09", "fy"));
  });
});

describe("source channel filter (Excel vs Data Entry)", () => {
  const excel = makeEv({
    eventId: "ex1",
    file: "ASSEMBLY_REJECTION_REPORT.xlsx",
    qty: 100,
    disposition: "rejected",
  });
  const excel2 = makeEv({
    eventId: "ex2",
    file: "BALLOON_VALVE.xlsx",
    stageId: "balloon",
    qty: 50,
    disposition: "rejected",
  });
  const manual = makeEv({
    eventId: "de1",
    file: "Manual Entry",
    extractedBy: "direct-entry",
    qty: 7,
    disposition: "rejected",
  });

  it("classifies direct-entry vs excel", () => {
    expect(isDirectEntryEvent(manual)).toBe(true);
    expect(isDirectEntryEvent(excel)).toBe(false);
  });

  it("lists distinct Excel files for the picker", () => {
    expect(listExcelSourceFiles([excel, excel2, manual])).toEqual([
      "ASSEMBLY_REJECTION_REPORT.xlsx",
      "BALLOON_VALVE.xlsx",
    ]);
  });

  it("Excel-only keeps upload rows even when Data Entry exists the same day", () => {
    // Same stage·day: without filtering first, DE would win. Excel-only must
    // still surface the upload row for the GM's selective view.
    const kept = scopeEvents([excel, manual], {
      grain: "month",
      sourceChannels: ["excel"],
    });
    expect(kept.some((e) => e.eventId === "ex1")).toBe(true);
    expect(kept.some((e) => e.eventId === "de1")).toBe(false);
  });

  it("Data-entry-only drops Excel uploads", () => {
    const kept = scopeEvents([excel, manual], {
      grain: "month",
      sourceChannels: ["direct-entry"],
    });
    expect(kept.map((e) => e.eventId)).toEqual(["de1"]);
  });

  it("restricts Excel to selected files when sourceFiles is set", () => {
    const kept = scopeEvents([excel, excel2, manual], {
      grain: "month",
      sourceChannels: ["excel"],
      sourceFiles: ["BALLOON_VALVE.xlsx"],
    });
    expect(kept.map((e) => e.eventId)).toEqual(["ex2"]);
  });

  it("resolveScope maps includeExcel / includeDirectEntry tweaks", () => {
    const scope: Scope = resolveScope([excel, manual], {
      grain: "month",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      includeExcel: true,
      includeDirectEntry: false,
      excelFiles: ["ASSEMBLY_REJECTION_REPORT.xlsx"],
    });
    expect(scope.sourceChannels).toEqual(["excel"]);
    expect(scope.sourceFiles).toEqual(["ASSEMBLY_REJECTION_REPORT.xlsx"]);
  });

  it("both channels with no file list omits source filters (full plant)", () => {
    const scope = resolveScope([excel], {
      grain: "month",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      includeExcel: true,
      includeDirectEntry: true,
      excelFiles: [],
    });
    expect(scope.sourceChannels).toBeUndefined();
    expect(scope.sourceFiles).toBeUndefined();
  });

  it("no channel selected yields NOTHING, not the full plant", () => {
    const tweaks = {
      grain: "month" as const,
      datePreset: "all" as const,
      dateFrom: "",
      dateTo: "",
      includeExcel: false,
      includeDirectEntry: false,
      excelFiles: [],
    };
    const scope = resolveScope([excel, manual], tweaks);
    expect(scope.sourceChannels).toEqual([]);
    expect(scopeEvents([excel, manual], scope)).toEqual([]);
    // …and the "all channels" result must not be served from the same cache slot.
    expect(
      scopeEvents([excel, manual], resolveScope([excel, manual], { ...tweaks, includeExcel: true, includeDirectEntry: true })).length,
    ).toBeGreaterThan(0);
  });

  it("an emptied scope leaves no stage that can be called the top rejecting one", () => {
    // The dashboard's "Top Rejecting Stage" tile picks the highest-rejecting row
    // out of byStage(). With no channel selected there must be no such row —
    // otherwise the tile names a bottleneck that has no records behind it.
    const scope = resolveScope([excel, manual], {
      grain: "month",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      includeExcel: false,
      includeDirectEntry: false,
      excelFiles: [],
    });
    expect(byStage([excel, manual], scope).filter((s) => s.rejected > 0)).toEqual([]);
  });

  it("no section selected yields NOTHING", () => {
    const scope = resolveScope([excel, manual], {
      grain: "month",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      stageCategories: [],
    });
    expect(scope.stageIds).toEqual([]);
    expect(scopeEvents([excel, manual], scope)).toEqual([]);
  });
});

describe("batch filter (batch-wise dashboard)", () => {
  const b1 = makeEv({
    eventId: "b1",
    batchNo: "26F27-14",
    extractedBy: "direct-entry",
    file: "Batch Entry 26F27-14",
    qty: 20,
  });
  const b2 = makeEv({
    eventId: "b2",
    batchNo: "26F28-16",
    extractedBy: "direct-entry",
    file: "Batch Entry 26F28-16",
    qty: 30,
  });
  const noBatch = makeEv({
    eventId: "nb",
    batchNo: null,
    file: "old-upload.xlsx",
    qty: 5,
  });

  it("reads and uppercases batchNo", () => {
    expect(eventBatchId(b1)).toBe("26F27-14");
    expect(eventBatchId(makeEv({ eventId: "x", batchNo: "26f27-14" }))).toBe("26F27-14");
    expect(eventBatchId(noBatch)).toBeNull();
  });

  it("lists distinct batch IDs for the Sources picker", () => {
    expect(listBatchIds([b1, b2, noBatch, b1])).toEqual(["26F28-16", "26F27-14"]);
  });

  it("ignores correction/annotation-only ghosts so deleted batches leave the picker", () => {
    const ghost = {
      ...makeEv({ eventId: "corr", batchNo: "26G27-14" }),
      eventType: "correction",
    } as Event;
    expect(listBatchIds([ghost])).toEqual([]);
    expect(listBatchIds([ghost, b1])).toEqual(["26F27-14"]);
  });

  it("restricts scope to selected batches and drops unbatched rows", () => {
    const kept = scopeEvents([b1, b2, noBatch], {
      grain: "month",
      batchIds: ["26F27-14"],
    });
    expect(kept.map((e) => e.eventId)).toEqual(["b1"]);
  });

  it("resolveScope maps batchIds tweak", () => {
    const scope = resolveScope([b1, b2], {
      grain: "month",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      batchIds: ["26f27-14"],
    });
    expect(scope.batchIds).toEqual(["26F27-14"]);
  });

  it("empty batchIds omits the filter (all batches)", () => {
    const scope = resolveScope([b1], {
      grain: "month",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      batchIds: [],
    });
    expect(scope.batchIds).toBeUndefined();
  });
});

describe("custom range vs batch-ID month letter (H = August)", () => {
  const augLot = buildBatchId("2026-08-05", "18Fr")!; // 26H05-18
  const mayLot = buildBatchId("2026-05-20", "8Fr")!; // 26E20-8
  const hRecordedInAug = makeEv({
    eventId: "h-aug",
    batchNo: augLot,
    day: "2026-08-05",
    extractedBy: "direct-entry",
    file: "Manual Entry",
  });
  const eRecordedInAug = makeEv({
    eventId: "e-aug",
    batchNo: mayLot,
    day: "2026-08-10",
    extractedBy: "direct-entry",
    file: "Manual Entry",
  });
  const hRecordedInSep = makeEv({
    eventId: "h-sep",
    batchNo: augLot,
    day: "2026-09-02",
    extractedBy: "direct-entry",
    file: "Manual Entry",
  });

  it("encodes August as month letter H", () => {
    expect(augLot).toBe("26H05-18");
    expect(parseBatchId(augLot)?.monthName).toBe("August");
    expect(parseBatchId(mayLot)?.monthCode).toBe("E");
  });

  it("custom range keeps lots by batch-ID date, so a May (E) lot recorded in August is OUT", () => {
    const kept = scopeEvents([hRecordedInAug, eRecordedInAug, hRecordedInSep], {
      grain: "day",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-20",
    });
    expect(kept.map((e) => e.eventId).sort()).toEqual(["h-aug", "h-sep"]);
  });

  it("a row with no parseable batch ID still uses occurredOn for the range", () => {
    const unbatched = makeEv({
      eventId: "nb",
      batchNo: null,
      day: "2026-08-10",
      file: "YEARLY.xlsx",
    });
    const kept = scopeEvents([unbatched, eRecordedInAug], {
      grain: "day",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-20",
    });
    expect(kept.map((e) => e.eventId)).toEqual(["nb"]);
  });

  it("with no range, the Sources picker still lists every lot", () => {
    expect(listBatchIds([hRecordedInAug, eRecordedInAug, hRecordedInSep])).toEqual([
      "26H05-18",
      "26E20-8",
    ]);
  });

  it("a custom range counts lots by batch-ID date (H = August), not recorded-on", () => {
    expect(
      listBatchIds([hRecordedInAug, eRecordedInAug, hRecordedInSep], {
        from: "2026-08-01",
        to: "2026-08-20",
      }),
    ).toEqual(["26H05-18"]);
  });

  it("the Sources count matches View Source: assembly-only drops H lots that never reached a gate", () => {
    const primaryOnly = makeEv({
      eventId: "h-primary",
      batchNo: buildBatchId("2026-08-06", "12Fr")!,
      day: "2026-08-06",
      stageId: "production",
      extractedBy: "direct-entry",
      file: "Manual Entry",
    });
    const all = [hRecordedInAug, primaryOnly];
    expect(listBatchIds(all, { from: "2026-08-01", to: "2026-08-20" }).sort()).toEqual([
      "26H05-18",
      "26H06-12",
    ]);
    const scoped = scopeEvents(
      all,
      resolveScope(all, {
        grain: "day",
        datePreset: "custom",
        dateFrom: "2026-08-01",
        dateTo: "2026-08-20",
      }),
    );
    expect(listBatchIds(scoped)).toEqual(["26H05-18"]);
  });

  it("widening the range to May includes the E lot and changes the count", () => {
    const may = listBatchIds([hRecordedInAug, eRecordedInAug, hRecordedInSep], {
      from: "2026-05-01",
      to: "2026-05-31",
    });
    const aug = listBatchIds([hRecordedInAug, eRecordedInAug, hRecordedInSep], {
      from: "2026-08-01",
      to: "2026-08-22",
    });
    expect(may).toEqual(["26E20-8"]);
    expect(aug).toEqual(["26H05-18"]);
    expect(may).not.toEqual(aug);
  });
});

describe("stage-category (shop-floor section) filter", () => {
  const base = {
    grain: "month" as const,
    datePreset: "all" as const,
    dateFrom: "",
    dateTo: "",
  };

  it("defaults to assembly only — primary/secondary never inflate a KPI by accident", () => {
    const scope = resolveScope([], base);
    expect(scope.stageIds).toEqual(
      expect.arrayContaining(["visual", "balloon", "valve-integrity", "final"]),
    );
    expect(scope.stageIds).not.toContain("production");
    expect(scope.stageIds).not.toContain("secondary");
  });

  it("adding primary widens the scope to the upstream stages", () => {
    const scope = resolveScope([], { ...base, stageCategories: ["assembly", "primary"] });
    expect(scope.stageIds).toEqual(expect.arrayContaining(["visual", "production", "trimming"]));
    expect(scope.stageIds).not.toContain("secondary");
  });

  it("selecting every section removes the restriction entirely", () => {
    const scope = resolveScope([], {
      ...base,
      stageCategories: ["primary", "secondary", "assembly"],
    });
    expect(scope.stageIds).toBeUndefined();
  });

  it("a pinned station view still wins over the section filter", () => {
    const scope = resolveScope([], { ...base, stageView: "production", stageCategories: ["assembly"] });
    expect(scope.stageIds).toEqual(["production"]);
  });
});

describe("describeActiveScope / plant default", () => {
  const plantDefault = {
    includeExcel: true,
    includeDirectEntry: true,
    excelFiles: [] as string[],
    batchIds: [] as string[],
    stageCategories: ["assembly"] as ("assembly")[],
    stageView: "cumulative",
  };

  it("flags plant default and labels it clearly", () => {
    expect(isPlantDefaultTweaks(plantDefault)).toBe(true);
    expect(describeActiveScope(plantDefault)).toMatch(/Plant default/i);
    expect(describeActiveScope(plantDefault)).toMatch(/full plant/i);
  });

  it("mentions sections and batches when narrowed", () => {
    expect(
      isPlantDefaultTweaks({
        ...plantDefault,
        stageCategories: ["assembly", "primary"],
        batchIds: ["26F27-14"],
      }),
    ).toBe(false);
    const s = describeActiveScope({
      ...plantDefault,
      stageCategories: ["assembly", "primary"],
      batchIds: ["26F27-14"],
    });
    expect(s).toMatch(/Primary|Assembly/i);
    expect(s).toMatch(/26F27-14/);
  });

  it("describeSourceFilter includes full plant when no batch filter", () => {
    const scope = resolveScope([], {
      grain: "month",
      datePreset: "all",
      dateFrom: "",
      dateTo: "",
      stageCategories: ["assembly"],
    });
    expect(describeSourceFilter(scope)).toMatch(/full plant/i);
    expect(describeSourceFilter(scope)).toMatch(/Assembly/i);
  });
});

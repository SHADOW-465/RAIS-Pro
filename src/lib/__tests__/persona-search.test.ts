import {
  PERSONAS,
  personaAllowsNav,
  filterNavKeys,
  isPersonaId,
  DEFAULT_PERSONA,
} from "../persona";
import { searchJumpTargets } from "../analytics/search-index";
import type { Event } from "@/lib/store/types";

function ev(partial: {
  eventId: string;
  eventType: Event["eventType"];
  stageId?: string;
  size?: string;
  batch?: string;
  disposition?: string;
  defect?: string;
  qty?: number;
}): Event {
  return {
    eventId: partial.eventId,
    schemaVersion: "1.0.0",
    ingestionId: "i",
    eventType: partial.eventType,
    occurredOn: { kind: "day", start: "2026-07-01", end: "2026-07-01" },
    provenance: {
      file: "f",
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
    extractedBy: "direct-entry",
    recordedAt: "2026-07-01T00:00:00.000Z",
    supersededBy: null,
    stageId: partial.stageId,
    size: partial.size ?? null,
    quantity: partial.qty ?? 1,
    unit: "pcs",
    batchNo: partial.batch ?? null,
    disposition: partial.disposition,
    defectCodeRaw: partial.defect,
    customFields: partial.batch ? { batch: partial.batch } : undefined,
  } as unknown as Event;
}

describe("persona nav filter", () => {
  it("hides schema and dense analysis from operators", () => {
    expect(personaAllowsNav("operator", "data-entry")).toBe(true);
    expect(personaAllowsNav("operator", "schema")).toBe(false);
    expect(personaAllowsNav("operator", "spc")).toBe(false);
    expect(personaAllowsNav("operator", "clear-data")).toBe(false);
  });

  it("gives GM export/audit path without entry chrome", () => {
    expect(personaAllowsNav("gm", "dashboard")).toBe(true);
    expect(personaAllowsNav("gm", "reports")).toBe(true);
    expect(personaAllowsNav("gm", "data-entry")).toBe(false);
    expect(personaAllowsNav("gm", "clear-data")).toBe(true);
  });

  it("QE can investigate deeply", () => {
    const keys = filterNavKeys("qe", [
      "dashboard",
      "stage",
      "defect",
      "spc",
      "schema",
      "clear-data",
    ]);
    expect(keys).toEqual(["dashboard", "stage", "defect", "spc", "schema"]);
  });

  it("validates persona ids", () => {
    expect(isPersonaId("qe")).toBe(true);
    expect(isPersonaId("nope")).toBe(false);
    expect(DEFAULT_PERSONA in PERSONAS).toBe(true);
  });
});

describe("searchJumpTargets", () => {
  const events = [
    ev({
      eventId: "1",
      eventType: "production",
      stageId: "visual",
      batch: "25A28",
      size: "Fr16",
      qty: 100,
    }),
    ev({
      eventId: "2",
      eventType: "rejection",
      stageId: "visual",
      defect: "Thin Spod",
      qty: 5,
    }),
  ];

  it("finds batch and stage by query", () => {
    const hits = searchJumpTargets("25A28", {
      events,
      allowedNavKeys: PERSONAS.qe.navAllow,
    });
    expect(hits.some((h) => h.kind === "batch" && h.label.includes("25A28"))).toBe(true);
  });

  it("filters destinations by persona", () => {
    const hits = searchJumpTargets("schema", {
      events: [],
      allowedNavKeys: PERSONAS.operator.navAllow,
    });
    expect(hits.some((h) => h.navKey === "schema")).toBe(false);
  });

  it("returns destinations when query empty", () => {
    const hits = searchJumpTargets("", {
      events: [],
      allowedNavKeys: PERSONAS.gm.navAllow,
    });
    expect(hits.some((h) => h.kind === "destination" && h.navKey === "dashboard")).toBe(true);
    expect(hits.some((h) => h.navKey === "data-entry")).toBe(false);
  });
});

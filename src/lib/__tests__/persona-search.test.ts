import {
  PERSONAS,
  PERSONA_ORDER,
  personaAllowsNav,
  filterNavKeys,
  isPersonaId,
  DEFAULT_PERSONA,
  canWrite,
  canApprove,
  canConfigure,
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
  it("exposes exactly three dashboard roles", () => {
    expect(PERSONA_ORDER).toEqual(["gm", "owner", "operator"]);
    expect(Object.keys(PERSONAS).sort()).toEqual(["gm", "operator", "owner"]);
  });

  it("GM sees the full sidebar (including Workbooks, Data, admin)", () => {
    expect(personaAllowsNav("gm", "dashboard")).toBe(true);
    expect(personaAllowsNav("gm", "workbooks")).toBe(true);
    expect(personaAllowsNav("gm", "data-entry")).toBe(true);
    expect(personaAllowsNav("gm", "staging")).toBe(true);
    expect(personaAllowsNav("gm", "audit")).toBe(true);
    expect(personaAllowsNav("gm", "schema")).toBe(true);
    expect(personaAllowsNav("gm", "settings")).toBe(true);
    expect(personaAllowsNav("gm", "spc")).toBe(true);
  });

  it("Owner hides Workbooks, Data, Audit Trail, Data Schema, Settings", () => {
    expect(personaAllowsNav("owner", "dashboard")).toBe(true);
    expect(personaAllowsNav("owner", "stage")).toBe(true);
    expect(personaAllowsNav("owner", "reports")).toBe(true);
    expect(personaAllowsNav("owner", "capa")).toBe(true);
    expect(personaAllowsNav("owner", "ask")).toBe(true);

    expect(personaAllowsNav("owner", "workbooks")).toBe(false);
    expect(personaAllowsNav("owner", "data-entry")).toBe(false);
    expect(personaAllowsNav("owner", "staging")).toBe(false);
    expect(personaAllowsNav("owner", "audit")).toBe(false);
    expect(personaAllowsNav("owner", "schema")).toBe(false);
    expect(personaAllowsNav("owner", "settings")).toBe(false);
  });

  it("Data Entry Operator hides only Data Schema and Settings", () => {
    expect(personaAllowsNav("operator", "dashboard")).toBe(true);
    expect(personaAllowsNav("operator", "workbooks")).toBe(true);
    expect(personaAllowsNav("operator", "data-entry")).toBe(true);
    expect(personaAllowsNav("operator", "staging")).toBe(true);
    expect(personaAllowsNav("operator", "audit")).toBe(true);
    expect(personaAllowsNav("operator", "spc")).toBe(true);
    expect(personaAllowsNav("operator", "schema")).toBe(false);
    expect(personaAllowsNav("operator", "settings")).toBe(false);
  });

  it("filterNavKeys drops denied destinations", () => {
    const keys = filterNavKeys("owner", [
      "dashboard",
      "workbooks",
      "data-entry",
      "stage",
      "audit",
      "schema",
      "settings",
      "ask",
    ]);
    expect(keys).toEqual(["dashboard", "stage", "ask"]);
  });

  it("validates persona ids and defaults to GM", () => {
    expect(isPersonaId("gm")).toBe(true);
    expect(isPersonaId("owner")).toBe(true);
    expect(isPersonaId("operator")).toBe(true);
    expect(isPersonaId("qe")).toBe(false);
    expect(isPersonaId("nope")).toBe(false);
    expect(DEFAULT_PERSONA).toBe("gm");
    expect(DEFAULT_PERSONA in PERSONAS).toBe(true);
  });

  // Roles no longer all land on the dashboard: an operator lands on the form
  // they are about to fill. The rule that matters is that a role can never be
  // dropped on a page its own nav filter hides.
  it("every role lands on a page that role can see", () => {
    const HOME_NAV: Record<string, string> = {
      "/": "dashboard",
      "/log/entry": "data-entry",
      "/excel/import": "staging",
    };
    for (const id of PERSONA_ORDER) {
      const home = PERSONAS[id].homeHref;
      const navKey = HOME_NAV[home];
      expect(navKey).toBeDefined();
      expect(PERSONAS[id].navAllow).toContain(navKey);
    }
  });

  it("the operator lands on Data Entry, the GM on the dashboard", () => {
    expect(PERSONAS.operator.homeHref).toBe("/log/entry");
    expect(PERSONAS.gm.homeHref).toBe("/");
    expect(PERSONAS.owner.homeHref).toBe("/");
  });

  it("GM has full capabilities; owner is view-only; operator can write but not approve/configure", () => {
    expect(canWrite("gm")).toBe(true);
    expect(canApprove("gm")).toBe(true);
    expect(canConfigure("gm")).toBe(true);

    expect(canWrite("owner")).toBe(false);
    expect(canApprove("owner")).toBe(false);
    expect(canConfigure("owner")).toBe(false);
    expect(PERSONAS.owner.title).toMatch(/view only/i);

    expect(canWrite("operator")).toBe(true);
    expect(canApprove("operator")).toBe(false);
    expect(canConfigure("operator")).toBe(false);
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
      allowedNavKeys: PERSONAS.gm.navAllow,
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

  it("returns destinations when query empty (Owner excludes data-entry)", () => {
    const hits = searchJumpTargets("", {
      events: [],
      allowedNavKeys: PERSONAS.owner.navAllow,
    });
    expect(hits.some((h) => h.kind === "destination" && h.navKey === "dashboard")).toBe(true);
    expect(hits.some((h) => h.navKey === "data-entry")).toBe(false);
    expect(hits.some((h) => h.navKey === "workbooks")).toBe(false);
  });
});

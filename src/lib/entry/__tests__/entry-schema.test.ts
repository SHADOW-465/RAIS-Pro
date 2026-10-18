import { templateFrom } from "@/app/api/entry-template/route";
import { plantCatalog } from "@/core/ontology/plant-catalog";
import {
  migrateToStageId,
  previousAcceptedStageId,
  resolveEntrySchema,
  schemaCategories,
  stationById,
  stationsIn,
} from "../entry-schema";

describe("migrateToStageId — in-flight drafts / shift rows / Ask MOID prefill", () => {
  test("prefers an already-canonical stageId", () => {
    expect(migrateToStageId({ stageId: "valve-integrity", micro: "p15-visual" })).toBe(
      "valve-integrity",
    );
  });

  test("maps every retired assembly micro id", () => {
    expect(migrateToStageId({ micro: "p15-visual" })).toBe("visual");
    expect(migrateToStageId({ micro: "p16-balloon" })).toBe("balloon");
    expect(migrateToStageId({ micro: "p17-valve" })).toBe("valve-integrity");
    expect(migrateToStageId({ micro: "p18-final" })).toBe("final");
  });

  test("department rows with empty or alias micros resolve from macro", () => {
    expect(migrateToStageId({ macro: "primary", micro: "" })).toBe("production");
    expect(migrateToStageId({ macro: "secondary", micro: "secondary" })).toBe("secondary");
    expect(migrateToStageId({ micro: "primary" })).toBe("production");
  });

  test("a stageId written into the micro slot (post-migration write) passes through", () => {
    expect(migrateToStageId({ micro: "valve-integrity" })).toBe("valve-integrity");
  });

  test("empty input defaults to visual so the form always has a station", () => {
    expect(migrateToStageId({})).toBe("visual");
  });
});

describe("resolveEntrySchema — total fallback, never mixed", () => {
  test("null / empty template is fully builtin", () => {
    const empty = resolveEntrySchema(null);
    expect(empty.source).toBe("builtin");
    expect(empty.stations.map((s) => s.stageId)).toEqual([
      "stripping",
      "eye-punching",
      "hanging",
      "visual",
      "balloon",
      "valve-integrity",
      "final",
    ]);
    expect(stationById(empty, "visual")?.columns).toContain("hold");
    expect(stationById(empty, "balloon")?.columns).not.toContain("hold");
    expect(stationById(empty, "eye-punching")?.defects).toEqual([]);
    expect(stationById(empty, "stripping")?.defects.map((d) => d.key)).toEqual([
      "COAG", "Raised Wire", "Surface Defect", "Overlaping", "Black Mark", "Webbing", "Missing Formers", "Others",
    ]);
  });

  test("a catalog station with no defects stays empty — seed list is not mixed in", () => {
    const schema = resolveEntrySchema({
      stages: [
        {
          stageId: "visual",
          label: "Visual",
          category: "assembly",
          columns: [{ key: "checked" }, { key: "rework" }],
          defects: [],
        },
      ],
    });
    expect(schema.source).toBe("catalog");
    expect(stationById(schema, "visual")?.defects).toEqual([]);
    expect(stationById(schema, "visual")?.columns).toEqual(["checked", "hold"]);
    // Builtin visual has 21 codes — they must not leak in.
    expect(stationById(schema, "visual")?.defects.length).toBe(0);
  });
});

const ENTRY_LINE = [
  "stripping",
  "eye-punching",
  "hanging",
  "visual",
  "balloon",
  "valve-integrity",
  "final",
];

describe("station → defect pairing matches /api/entry-template for every stage", () => {
  test("every template stage renders the same defect codes, in the same order", () => {
    const template = templateFrom(plantCatalog());
    const schema = resolveEntrySchema(template);
    expect(schema.source).toBe("catalog");
    // Data Entry lists the plant's entry line, not every catalog stage.
    expect(schema.stations.map((s) => s.stageId)).toEqual(ENTRY_LINE);
    for (const st of template.stages.filter((t) => ENTRY_LINE.includes(t.stageId))) {
      const station = stationById(schema, st.stageId);
      expect(station).toBeDefined();
      expect(station!.defects.map((d) => d.key)).toEqual(
        st.defects.map((d) => d.defectCode),
      );
      expect(station!.label).toBe(st.label);
    }
  });

  test("HOLD is a catalog capture on visual only — not a stageId literal", () => {
    const schema = resolveEntrySchema(templateFrom(plantCatalog()));
    expect(stationById(schema, "visual")?.columns).toContain("hold");
    for (const id of ["balloon", "valve-integrity", "final", "stripping"]) {
      expect(stationById(schema, id)?.columns).not.toContain("hold");
    }
  });

  test("stages the plant does not type by hand are hidden from entry", () => {
    const schema = resolveEntrySchema(templateFrom(plantCatalog()));
    for (const id of [
      "production",
      "leaching",
      "chlorination",
      "gauge",
      "trimming",
      "balloon-production",
      "secondary",
      "valve-fixing",
      "primary-pack-inspection",
    ]) {
      expect(stationById(schema, id)).toBeUndefined();
    }
    expect(stationsIn(schema, "primary").map((s) => s.stageId)).toEqual(["stripping"]);
    expect(stationsIn(schema, "secondary").map((s) => s.stageId)).toEqual(["eye-punching", "hanging"]);
  });

  test("Stripping keeps the 8 dipping defects, in dipping order", () => {
    const schema = resolveEntrySchema(templateFrom(plantCatalog()));
    expect(stationById(schema, "stripping")!.defects.map((d) => d.key)).toEqual([
      "COAG", "RW", "SD", "OL", "BM", "WEB", "MF", "OTH",
    ]);
  });

  test("Dipping and its production-dipping alias are both hidden from entry", () => {
    const col = [{ key: "checked" }];
    const schema = resolveEntrySchema({
      stages: [
        { stageId: "production", label: "Dipping", category: "primary", columns: col },
        { stageId: "production-dipping", label: "Production Dipping", category: "primary", columns: col },
        { stageId: "stripping", label: "Stripping", category: "primary", columns: col },
      ],
    });
    expect(schema.stations.map((s) => s.stageId)).toEqual(["stripping"]);
  });

  test("a stage added by hand on Data Schema still appears", () => {
    const schema = resolveEntrySchema({
      stages: [{ stageId: "polishing", label: "Polishing", category: "primary", columns: [{ key: "checked" }] }],
    });
    expect(schema.stations.map((s) => s.stageId)).toEqual(["polishing"]);
  });

  test("catalog Hold on balloon becomes a Data Entry column", () => {
    const catalog = plantCatalog();
    const withHold = {
      ...catalog,
      stages: catalog.stages.map((s) =>
        s.stageId === "balloon"
          ? { ...s, captures: ["checked", "accepted", "hold", "rejected"] as NonNullable<typeof s.captures> }
          : s,
      ),
    };
    const tpl = templateFrom(withHold);
    expect(tpl.stages.find((s) => s.stageId === "balloon")!.columns.map((c) => c.key)).toContain(
      "rework",
    );
    const schema = resolveEntrySchema(tpl);
    expect(schema.source).toBe("catalog");
    expect(stationById(schema, "balloon")?.columns).toContain("hold");
  });

  test("stationsIn and schemaCategories follow plant entry order", () => {
    const schema = resolveEntrySchema({
      stages: [
        { stageId: "final", label: "Final", category: "assembly", columns: [{ key: "checked" }] },
        { stageId: "visual", label: "Visual", category: "assembly", columns: [{ key: "checked" }] },
        { stageId: "balloon", label: "Balloon", category: "assembly", columns: [{ key: "checked" }] },
        { stageId: "valve-integrity", label: "Valve", category: "assembly", columns: [{ key: "checked" }] },
        { stageId: "stripping", label: "Stripping", category: "primary", columns: [{ key: "checked" }] },
        { stageId: "eye-punching", label: "Eye Punching", category: "secondary", columns: [{ key: "checked" }] },
      ],
      sections: [
        { id: "assembly", label: "Assembly" },
        { id: "secondary", label: "Secondary" },
        { id: "primary", label: "Primary" },
      ],
    });
    expect(stationsIn(schema, "assembly").map((s) => s.stageId)).toEqual([
      "visual",
      "balloon",
      "valve-integrity",
      "final",
    ]);
    expect(schemaCategories(schema).map((c) => c.id)).toEqual(["primary", "secondary", "assembly"]);
  });

  test("previous accepted station walks the plant cascade across processes", () => {
    const schema = resolveEntrySchema(templateFrom(plantCatalog()));
    // Dipping is not an entry station, so Stripping starts the line.
    expect(previousAcceptedStageId(schema, "stripping")).toBeNull();
    expect(previousAcceptedStageId(schema, "eye-punching")).toBe("stripping");
    // Hanging and the retired lumped Secondary row record no accepted qty, so
    // Visual prefills from the last station that does.
    expect(previousAcceptedStageId(schema, "visual")).toBe("eye-punching");
    expect(previousAcceptedStageId(schema, "balloon")).toBe("visual");
    expect(previousAcceptedStageId(schema, "valve-integrity")).toBe("balloon");
    expect(previousAcceptedStageId(schema, "final")).toBe("valve-integrity");
  });
});

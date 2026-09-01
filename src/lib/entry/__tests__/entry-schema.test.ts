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
      "production",
      "secondary",
      "visual",
      "balloon",
      "valve-integrity",
      "final",
    ]);
    expect(stationById(empty, "visual")?.columns).toContain("hold");
    expect(stationById(empty, "balloon")?.columns).not.toContain("hold");
    expect(stationById(empty, "secondary")?.defects).toEqual([]);
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

describe("station → defect pairing matches /api/entry-template for every stage", () => {
  test("every template stage renders the same defect codes, in the same order", () => {
    const template = templateFrom(plantCatalog());
    const schema = resolveEntrySchema(template);
    expect(schema.source).toBe("catalog");
    expect(schema.stations.map((s) => s.stageId)).toEqual(
      template.stages.map((s) => s.stageId),
    );
    for (const st of template.stages) {
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
    for (const id of ["balloon", "valve-integrity", "final", "production"]) {
      expect(stationById(schema, id)?.columns).not.toContain("hold");
    }
  });

  test("Primary Pack Inspection is a reachable assembly station", () => {
    const schema = resolveEntrySchema(templateFrom(plantCatalog()));
    const pack = stationById(schema, "primary-pack-inspection");
    expect(pack).toBeDefined();
    expect(pack!.category).toBe("assembly");
    expect(stationsIn(schema, "assembly").some((s) => s.stageId === "primary-pack-inspection")).toBe(
      true,
    );
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
    expect(stationById(schema, "production-dipping")?.extras ?? stationById(schema, "production")?.extras).toEqual(
      ["trolleys"],
    );
  });

  test("production-dipping extras follow the authored production station", () => {
    const schema = resolveEntrySchema({
      stages: [
        {
          stageId: "production-dipping",
          label: "Production Dipping",
          category: "primary",
          columns: [{ key: "checked" }, { key: "accepted" }, { key: "rejected" }],
        },
      ],
      sections: [{ id: "primary", label: "Production Dipping" }],
    });
    expect(schema.source).toBe("catalog");
    expect(stationById(schema, "production-dipping")?.extras).toEqual(["trolleys"]);
    expect(schemaCategories(schema).map((c) => c.label)).toEqual(["Production Dipping"]);
  });

  test("stationsIn and schemaCategories follow plant entry order", () => {
    const schema = resolveEntrySchema({
      stages: [
        { stageId: "final", label: "Final", category: "assembly", columns: [{ key: "checked" }] },
        { stageId: "visual", label: "Visual", category: "assembly", columns: [{ key: "checked" }] },
        { stageId: "balloon", label: "Balloon", category: "assembly", columns: [{ key: "checked" }] },
        { stageId: "valve-integrity", label: "Valve", category: "assembly", columns: [{ key: "checked" }] },
        { stageId: "production", label: "Dipping", category: "primary", columns: [{ key: "checked" }] },
        { stageId: "secondary", label: "Secondary", category: "secondary", columns: [{ key: "checked" }] },
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
    expect(previousAcceptedStageId(schema, "production")).toBeNull();
    expect(previousAcceptedStageId(schema, "eye-punching")).toBe("production");
    expect(previousAcceptedStageId(schema, "secondary")).toBe("eye-punching");
    expect(previousAcceptedStageId(schema, "visual")).toBe("secondary");
    expect(previousAcceptedStageId(schema, "balloon")).toBe("visual");
    expect(previousAcceptedStageId(schema, "valve-integrity")).toBe("balloon");
    expect(previousAcceptedStageId(schema, "final")).toBe("valve-integrity");
  });
});

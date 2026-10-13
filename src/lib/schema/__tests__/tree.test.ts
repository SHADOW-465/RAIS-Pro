import {
  buildSchemaTree,
  deleteIntentFor,
  orderByCascade,
  filterTree,
  visibleRows,
  type SchemaNode,
  type SchemaTreeInput,
} from "../tree";

const input: SchemaTreeInput = {
  stages: [
    { stageId: "production", label: "Production (Dipping)", category: "primary", captures: ["checked", "accepted", "rejected"], upstream: [] },
    { stageId: "trimming", label: "Trimming", category: "primary", captures: ["checked"], upstream: ["production"] },
    { stageId: "eye-punching", label: "Eye Punching", category: "secondary", captures: ["checked"], upstream: ["production"] },
    { stageId: "visual", label: "Visual Inspection (P17)", category: "assembly", captures: ["checked", "accepted", "hold", "rejected"], upstream: [], isQualityGate: true },
    { stageId: "final", label: "Final Inspection (P24)", category: "assembly", captures: ["checked", "accepted", "rejected"], upstream: ["visual"], isQualityGate: true },
  ],
  defects: [
    { defectCode: "COAG", label: "Coagulation", stages: ["visual", "final"] },
    { defectCode: "AIR", label: "Air bubble", stages: ["production"] },
    { defectCode: "GHOST", label: "Never scoped", stages: [] },
  ],
  sizes: [{ sizeId: "Fr14", label: "14Fr" }],
  mappings: [
    { kind: "stage-alias", key: "VISUAL INSEPTION", canonicalId: "visual" },
    { kind: "stage-alias", key: "DIPPING", canonicalId: "production" },
    { kind: "defect-alias", key: "COAGULATION", canonicalId: "COAG" },
    { kind: "header-pattern", key: "CUMMULATIVE", canonicalId: "nothing-here" },
  ],
};

const tree = buildSchemaTree(input);
const byId = (nodes: SchemaNode[], id: string): SchemaNode | undefined => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = byId(n.children, id);
    if (hit) return hit;
  }
  return undefined;
};

describe("buildSchemaTree", () => {
  it("renders the three shop-floor sections in authored order", () => {
    const cats = tree.filter((n) => n.kind === "category");
    expect(cats.map((c) => c.label)).toEqual([
      "Production Dipping",
      "Secondary (P10–P14)",
      "Assembly (P15–P27)",
    ]);
    expect(cats.every((c) => !c.locked)).toBe(true);
  });

  it("uses catalog section labels when they have been renamed", () => {
    const renamed = buildSchemaTree({
      ...input,
      sections: [
        { id: "primary", label: "Dipping line" },
        { id: "secondary", label: "Secondary" },
        { id: "assembly", label: "Assembly" },
      ],
    });
    expect(renamed.find((n) => n.id === "cat:primary")?.label).toBe("Dipping line");
  });

  it("puts each stage under its category", () => {
    expect(byId(tree, "cat:secondary/stage:eye-punching")).toBeTruthy();
    expect(byId(tree, "cat:primary/stage:production")).toBeTruthy();
    expect(byId(tree, "cat:assembly/stage:visual")).toBeTruthy();
  });

  it("orders stages down the process cascade, not by array order", () => {
    const assembly = tree.find((n) => n.id === "cat:assembly")!;
    expect(assembly.children.map((c) => c.ref?.stageId)).toEqual(["visual", "final"]);
  });

  it("shows a shared defect under every stage it is scoped to, badged", () => {
    const onVisual = byId(tree, "cat:assembly/stage:visual/defects/defect:COAG")!;
    const onFinal = byId(tree, "cat:assembly/stage:final/defects/defect:COAG")!;
    expect(onVisual.badge).toBe("shared");
    expect(onVisual.sublabel).toContain("Final Inspection");
    expect(onFinal.sublabel).toContain("Visual Inspection");
    // ...and the definition still lives in the global folder.
    expect(byId(tree, "all-defects/defect:COAG")).toBeTruthy();
  });

  it("does not badge a defect that lives on one stage", () => {
    expect(byId(tree, "cat:primary/stage:production/defects/defect:AIR")!.badge).toBeUndefined();
  });

  it("keeps an empty Captures folder on a stage so columns can be added", () => {
    const empty = buildSchemaTree({
      ...input,
      stages: input.stages.map((s) =>
        s.stageId === "trimming" ? { ...s, captures: [] } : s,
      ),
    });
    const folder = byId(empty, "cat:primary/stage:trimming/captures");
    expect(folder?.kind).toBe("captures-folder");
    expect(folder?.count).toBe(0);
  });

  it("keeps an empty Defects folder on a stage so the first code can be added", () => {
    const empty = buildSchemaTree({
      ...input,
      defects: input.defects.filter((d) => !(d.stages ?? []).includes("trimming")),
    });
    const folder = byId(empty, "cat:primary/stage:trimming/defects");
    expect(folder?.kind).toBe("defects-folder");
    expect(folder?.count).toBe(0);
    expect(folder?.children).toEqual([]);
  });

  it("flags a defect scoped to nothing — it is invisible in Data Entry", () => {
    expect(byId(tree, "all-defects/defect:GHOST")!.badge).toBe("orphan");
  });

  it("hides alias folders under Production Dipping but keeps them elsewhere", () => {
    expect(byId(tree, "cat:primary/stage:production/aliases")).toBeUndefined();
    expect(byId(tree, "cat:assembly/stage:visual/aliases")).toBeTruthy();
  });

  it("marks a spelling that differs from its canonical id", () => {
    const alias = byId(tree, "cat:assembly/stage:visual/aliases/alias:stage-alias:VISUAL INSEPTION")!;
    expect(alias.badge).toBe("misspelling");
  });

  it("collects mappings that resolve to nothing", () => {
    const unmatched = tree.find((n) => n.id === "unmatched")!;
    expect(unmatched.children.map((c) => c.label)).toEqual(["CUMMULATIVE"]);
  });

  it("strips STAGE: before matching a stage alias, and does not orphan it", () => {
    const prefixed = buildSchemaTree({
      ...input,
      mappings: [
        ...input.mappings!,
        { kind: "stage-alias", key: "VISUAL INSPECTION", canonicalId: "STAGE:visual" },
        { kind: "column-mapping", key: "Checked Qty", canonicalId: "checked" },
        { kind: "stage-alias", key: "eye punching", canonicalId: "STAGE:visual" },
      ],
    });
    expect(prefixed.find((n) => n.id === "unmatched")!.children.map((c) => c.label)).toEqual(["CUMMULATIVE"]);
    const mappings = prefixed.find((n) => n.id === "column-mappings")!;
    expect(mappings.badge).toBeUndefined();
    expect(mappings.children.map((c) => c.label)).toEqual(["Checked Qty"]);
    const suspicious = prefixed.find((n) => n.id === "suspicious")!;
    expect(suspicious.badge).toBe("suspicious");
    expect(suspicious.children.map((c) => c.label)).toEqual(["eye punching"]);
    const underVisual = byId(prefixed, "cat:assembly/stage:visual/aliases/alias:stage-alias:eye punching")!;
    expect(underVisual.badge).toBe("suspicious");
  });

  it("surfaces a stage whose category is unrecognised rather than dropping it", () => {
    const odd = buildSchemaTree({
      ...input,
      stages: [{ stageId: "mystery", label: "Mystery", category: "nope", captures: ["checked"] }],
    });
    expect(byId(odd, "cat:nope/stage:mystery")).toBeTruthy();
  });

  it("puts a stage with no category under Unassigned", () => {
    const odd = buildSchemaTree({
      ...input,
      stages: [{ stageId: "mystery", label: "Mystery", captures: ["checked"] }],
    });
    expect(byId(odd, "cat:unassigned/stage:mystery")).toBeTruthy();
  });
});

describe("orderByCascade", () => {
  it("keeps stages caught in a cycle instead of losing them", () => {
    const cyclic = [
      { stageId: "a", label: "A", upstream: ["b"] },
      { stageId: "b", label: "B", upstream: ["a"] },
    ];
    expect(orderByCascade(cyclic).map((s) => s.stageId).sort()).toEqual(["a", "b"]);
  });
});

describe("deleteIntentFor", () => {
  it("deleting a defect inside a stage folder UNSCOPES it, leaving the others", () => {
    const node = byId(tree, "cat:assembly/stage:visual/defects/defect:COAG")!;
    expect(deleteIntentFor(node, input)).toEqual({
      kind: "unscope-defect",
      defectCode: "COAG",
      stageId: "visual",
      remaining: ["final"],
    });
  });

  it("deleting a defect from All defects removes it everywhere, naming the stages", () => {
    const node = byId(tree, "all-defects/defect:COAG")!;
    expect(deleteIntentFor(node, input)).toEqual({
      kind: "delete-defect",
      defectCode: "COAG",
      affectedStages: ["visual", "final"],
    });
  });

  it("names the defects a stage delete would orphan", () => {
    const node = byId(tree, "cat:primary/stage:production")!;
    expect(deleteIntentFor(node, input)).toEqual({
      kind: "delete-stage",
      stageId: "production",
      // COAG survives on final; AIR has nowhere else to live.
      orphanedDefects: ["AIR"],
    });
  });

  it("deleting a section names how many stages live in it", () => {
    const node = tree.find((n) => n.id === "cat:assembly")!;
    expect(deleteIntentFor(node, input)).toEqual({
      kind: "delete-section",
      categoryId: "assembly",
      stageCount: 2,
    });
  });
});

describe("visibleRows / filterTree", () => {
  it("shows only expanded branches", () => {
    const collapsed = visibleRows(tree, new Set());
    expect(collapsed.every((r) => r.depth === 0)).toBe(true);
    const opened = visibleRows(tree, new Set(["cat:assembly"]));
    expect(opened.some((r) => r.node.ref?.stageId === "visual")).toBe(true);
  });

  it("keeps ancestors of a match and reports what to expand", () => {
    const { nodes, expand } = filterTree(tree, "coag");
    expect(byId(nodes, "all-defects/defect:COAG")).toBeTruthy();
    expect(expand.has("all-defects")).toBe(true);
    // A branch with no match anywhere is gone.
    expect(nodes.find((n) => n.id === "sizes")).toBeUndefined();
  });
});

describe("an emptied category still offers a place to add back into", () => {
  it("keeps the category folder (with zero children) rather than dropping it", () => {
    const emptied = buildSchemaTree({ ...input, stages: input.stages.filter((s) => s.category !== "primary") });
    const primary = emptied.find((n) => n.id === "cat:primary")!;
    expect(primary).toBeTruthy();
    expect(primary.children).toEqual([]);
    expect(primary.locked).toBeFalsy();
  });
});

// A report is page-shaped: pressing Export on Defect Analysis must give a
// defect report, not a generic dump — the same discipline as the topbar's
// per-page scope controls.
import {
  presetFor,
  canReport,
  availableBlocks,
  moveBlock,
  REPORT_PRESETS,
  forensicBookSpec,
  isForensicSpec,
  cloneSpec,
  type ReportBlock,
} from "@/lib/report/blocks";
import { builtInNamedPresets, saveNamedPreset, deleteNamedPreset, listNamedPresets } from "@/lib/report/presets-store";
import type { NavKey } from "@/lib/nav-keys";

describe("per-page report presets", () => {
  it("offers a report only on screens that have findings to report", () => {
    expect(canReport("dashboard")).toBe(true);
    expect(canReport("defect")).toBe(true);
    expect(canReport("spc")).toBe(true);
    // Configuration surfaces, not findings — no Export button at all.
    expect(canReport("schema")).toBe(false);
    expect(canReport("settings")).toBe(false);
    expect(canReport("data-entry")).toBe(false);
    expect(canReport("staging")).toBe(false);
  });

  it("gives every reportable screen a cover and at least one content block", () => {
    for (const page of Object.keys(REPORT_PRESETS) as NavKey[]) {
      const spec = presetFor(page)!;
      expect(spec.origin).toBe(page);
      expect(spec.blocks[0].kind).toBe("cover");
      expect(spec.blocks.length).toBeGreaterThan(1);
      expect(spec.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("shapes each preset to its own screen", () => {
    const defect = presetFor("defect")!;
    // A defect report leads with defects, not a generic stage table.
    expect(defect.blocks.some((b) => b.kind === "table" && b.table === "by-defect")).toBe(true);

    const size = presetFor("size")!;
    expect(size.blocks.some((b) => b.kind === "table" && b.table === "by-size")).toBe(true);

    const copqSpec = presetFor("copq")!;
    expect(copqSpec.blocks.some((b) => b.kind === "kpi-row" && b.kpis.includes("copq"))).toBe(true);

    const capa = presetFor("capa")!;
    expect(capa.blocks.some((b) => b.kind === "table" && b.table === "capa-open")).toBe(true);
  });

  it("keeps the provenance appendix out of the executive presets", () => {
    // The GM's report should not open with CSV lineage; the audit-facing
    // screens are the ones that carry it by default.
    expect(presetFor("dashboard")!.blocks.some((b) => b.kind === "evidence")).toBe(false);
    expect(presetFor("defect")!.blocks.some((b) => b.kind === "evidence")).toBe(false);
    expect(presetFor("audit")!.blocks.some((b) => b.kind === "evidence")).toBe(true);
  });

  it("gives every block a unique id so reordering and removal are stable", () => {
    const spec = presetFor("dashboard")!;
    const ids = spec.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers nothing to add on a screen that cannot report", () => {
    expect(availableBlocks("settings")).toEqual([]);
    expect(availableBlocks("dashboard").length).toBeGreaterThan(0);
  });

  it("returns null rather than an empty report for a non-reporting screen", () => {
    expect(presetFor("settings")).toBeNull();
  });
});

describe("moveBlock", () => {
  const b = (id: string): ReportBlock => ({ id, kind: "text", title: id, body: "" });
  const blocks = [b("a"), b("b"), b("c")];

  it("moves a block up and down", () => {
    expect(moveBlock(blocks, 1, -1).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(moveBlock(blocks, 1, 1).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the ends, so the buttons can never corrupt the order", () => {
    expect(moveBlock(blocks, 0, -1).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(moveBlock(blocks, 2, 1).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input", () => {
    moveBlock(blocks, 0, 1);
    expect(blocks.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("Phase 2 — named presets (forensic book retired)", () => {
  it("reports page can report and defaults to a GM summary, not the forensic book", () => {
    expect(canReport("reports")).toBe(true);
    const reports = presetFor("reports")!;
    expect(isForensicSpec(reports)).toBe(false);
    expect(reports.blocks[0].kind).toBe("cover");
    expect(reports.blocks.some((b) => b.kind === "kpi-row")).toBe(true);
  });

  it("retired forensicBookSpec is empty and not a renderable forensic book", () => {
    const forensic = forensicBookSpec();
    expect(isForensicSpec(forensic)).toBe(false);
    expect(forensic.blocks.some((b) => b.kind === "forensic-book")).toBe(false);
  });

  it("does not ship a Full forensic package built-in", () => {
    const names = builtInNamedPresets().map((p) => p.name);
    expect(names).toContain("GM monthly summary");
    expect(names).not.toContain("Full forensic package");
    expect(builtInNamedPresets().some((p) => p.id === "builtin:forensic")).toBe(false);
  });

  it("cloneSpec assigns fresh block ids so two loads do not share keys", () => {
    const a = cloneSpec(presetFor("dashboard")!);
    const b = cloneSpec(presetFor("dashboard")!);
    expect(a.blocks.map((x) => x.id)).not.toEqual(b.blocks.map((x) => x.id));
  });

  it("does not offer the forensic book as an addable section", () => {
    expect(availableBlocks("reports").some((b) => b.kind === "forensic-book")).toBe(false);
    expect(availableBlocks("dashboard").some((b) => b.kind === "forensic-book")).toBe(false);
  });
});

describe("named preset store (user saves)", () => {
  // node env has no localStorage — store falls back to empty user list.
  it("lists built-ins even without localStorage", () => {
    const list = listNamedPresets();
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.every((p) => p.builtIn || p.id.startsWith("user:"))).toBe(true);
  });

  it("saveNamedPreset returns a user preset with a fresh id", () => {
    // In node, save is a no-op on storage but still returns the object.
    const saved = saveNamedPreset("My pack", presetFor("defect")!);
    expect(saved.builtIn).toBe(false);
    expect(saved.name).toBe("My pack");
    expect(saved.id.startsWith("user:")).toBe(true);
    // delete is a no-op without matching storage — just shouldn't throw
    deleteNamedPreset(saved.id);
  });
});

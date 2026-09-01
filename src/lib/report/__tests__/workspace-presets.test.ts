import {
  builtInWorkspacePresets,
  saveWorkspacePreset,
  deleteWorkspacePreset,
  listWorkspacePresets,
  memoryStorage,
  workspacePresetFingerprint,
  WORKSPACE_PRESETS_KEY,
} from "../workspace-presets";

describe("workspace layout presets", () => {
  it("built-ins cannot be overwritten", () => {
    const storage = memoryStorage();
    const res = saveWorkspacePreset(
      {
        id: "builtin:fy-audit-pack",
        name: "Hacked",
        reportType: "fundamentals",
        periodMode: "financial-year",
      },
      storage,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cannot be overwritten/i);
  });

  it("Update and Save as copy use different ids when copy", () => {
    const storage = memoryStorage();
    const first = saveWorkspacePreset(
      { name: "Mine", reportType: "stage", periodMode: "financial-year" },
      storage,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const updated = saveWorkspacePreset(
      { id: first.value.id, name: "Mine updated", reportType: "defect", periodMode: "financial-year" },
      storage,
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.id).toBe(first.value.id);
    const copy = saveWorkspacePreset(
      { name: "Mine copy", reportType: "size", periodMode: "custom" },
      storage,
    );
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    expect(copy.value.id).not.toBe(first.value.id);
  });

  it("does not persist custom dates unless asked", () => {
    const storage = memoryStorage();
    const saved = saveWorkspacePreset(
      {
        name: "FY pack",
        reportType: "fy-audit-pack",
        periodMode: "custom",
        dateFrom: "2025-01-01",
        dateTo: "2025-01-31",
      },
      storage,
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.dateFrom).toBeUndefined();
    expect(saved.value.persistCustomDates).toBe(false);
    const withDates = saveWorkspacePreset(
      {
        name: "Frozen",
        reportType: "fundamentals",
        periodMode: "custom",
        persistCustomDates: true,
        dateFrom: "2025-01-01",
        dateTo: "2025-01-31",
      },
      storage,
    );
    expect(withDates.ok).toBe(true);
    if (!withDates.ok) return;
    expect(withDates.value.dateFrom).toBe("2025-01-01");
  });

  it("surfaces storage write failure", () => {
    const failing = {
      getItem: () => "[]",
      setItem: () => {
        throw new Error("quota");
      },
    };
    const res = saveWorkspacePreset(
      { name: "X", reportType: "stage", periodMode: "financial-year" },
      failing,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/could not write/i);
  });

  it("fingerprint changes when type changes (dirty)", () => {
    const a = workspacePresetFingerprint({ reportType: "stage", periodMode: "financial-year", notes: "" });
    const b = workspacePresetFingerprint({ reportType: "defect", periodMode: "financial-year", notes: "" });
    expect(a).not.toBe(b);
  });

  it("lists built-ins even with empty storage", () => {
    const list = listWorkspacePresets(memoryStorage());
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.filter((p) => p.builtIn).map((p) => p.id)).toEqual(
      builtInWorkspacePresets().map((p) => p.id),
    );
    expect(list.value.some((p) => p.id === "builtin:forensic")).toBe(false);
  });

  it("cannot delete built-ins", () => {
    const res = deleteWorkspacePreset("builtin:fy-audit-pack", memoryStorage());
    expect(res.ok).toBe(false);
  });

  it("storage key is explicit", () => {
    expect(WORKSPACE_PRESETS_KEY).toBe("moid_report_workspace_presets");
  });
});

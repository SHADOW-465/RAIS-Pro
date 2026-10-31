import { __resetSharedStateForTests, getSharedStateStore } from "../store";

const grant = {
  entryKey: "2026-10-01|26J01-14|visual|14Fr|2 way",
  approvedBy: "gm",
  approvedAt: "2026-10-01T10:00:00.000Z",
  expiresAt: "2026-10-01T12:00:00.000Z",
};

beforeEach(() => {
  __resetSharedStateForTests();
});

describe("shared state store", () => {
  it("imports a local document only while the plant document is empty", async () => {
    const store = getSharedStateStore();
    const first = await store.importIfEmpty("default", "custom-defects", [{ code: "X", label: "Odd", aliases: "" }], "gm");
    expect(first.imported).toBe(true);
    const second = await store.importIfEmpty("default", "custom-defects", [{ code: "Y", label: "Other", aliases: "" }], "operator");
    expect(second.imported).toBe(false);
    expect(second.record).toEqual([{ code: "X", label: "Odd", aliases: "" }]);
  });

  it("merges one edit grant without dropping another entry", async () => {
    const store = getSharedStateStore();
    await store.mergeGrant("default", grant, "gm");
    await store.mergeGrant("default", { ...grant, entryKey: "other-row", approvedBy: "gm" }, "gm");
    await store.mergeGrant("default", { ...grant, approvedBy: "gm-2" }, "gm");
    const read = await store.read("default", "edit-grants");
    const grants = (read.record as { grants: { entryKey: string; approvedBy: string }[] }).grants;
    expect(grants.map((g) => g.entryKey).sort()).toEqual([grant.entryKey, "other-row"]);
    expect(grants.find((g) => g.entryKey === grant.entryKey)?.approvedBy).toBe("gm-2");
  });

  it("revokes one grant and leaves the rest", async () => {
    const store = getSharedStateStore();
    await store.mergeGrant("default", grant, "gm");
    await store.mergeGrant("default", { ...grant, entryKey: "keep" }, "gm");
    await store.revokeGrant("default", grant.entryKey, "gm");
    const read = await store.read("default", "edit-grants");
    expect((read.record as { grants: { entryKey: string }[] }).grants.map((g) => g.entryKey)).toEqual(["keep"]);
  });
});

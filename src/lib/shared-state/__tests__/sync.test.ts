import { isEmptyRecord, parseKindRecord } from "../kinds";
import { nextSyncStep } from "../sync";
import { sharedStateMissing, SHARED_STATE_UNAVAILABLE_MESSAGE } from "../store";

describe("nextSyncStep", () => {
  it("applies a server document and does not re-import over it", () => {
    expect(nextSyncStep({ status: 200, serverEmpty: false, localEmpty: false, imported: false })).toBe("apply-server");
    expect(nextSyncStep({ status: 200, serverEmpty: false, localEmpty: true, imported: false })).toBe("apply-server");
  });

  it("imports local data once when the server document is empty", () => {
    expect(nextSyncStep({ status: 200, serverEmpty: true, localEmpty: false, imported: false })).toBe("import-local");
    expect(nextSyncStep({ status: 200, serverEmpty: true, localEmpty: false, imported: true })).toBe("mark-empty");
  });

  it("marks both-empty so the next load does not post again", () => {
    expect(nextSyncStep({ status: 200, serverEmpty: true, localEmpty: true, imported: false })).toBe("mark-empty");
  });

  // keep-local: caller must not delete the local copy and must not mark it imported.
  it("keeps local data when the table is missing or the server errors", () => {
    expect(nextSyncStep({ status: 503, serverEmpty: true, localEmpty: false, imported: false })).toBe("keep-local");
    expect(nextSyncStep({ status: 500, serverEmpty: true, localEmpty: false, imported: false })).toBe("keep-local");
  });

  it("stays quiet on auth failures so a role miss is not shown as a missing table", () => {
    expect(nextSyncStep({ status: 401, serverEmpty: true, localEmpty: false, imported: false })).toBe("keep-silent");
    expect(nextSyncStep({ status: 403, serverEmpty: true, localEmpty: false, imported: false })).toBe("keep-silent");
    expect(nextSyncStep({ status: 400, serverEmpty: true, localEmpty: false, imported: false })).toBe("keep-silent");
  });
});

describe("isEmptyRecord", () => {
  it("treats a saved shift window as present and a blank lot pin as empty", () => {
    expect(isEmptyRecord("shift-windows", { timezone: "Asia/Kolkata", windows: {} })).toBe(false);
    expect(isEmptyRecord("shift-windows", null)).toBe(true);
    expect(isEmptyRecord("lot-memory", null)).toBe(true);
    expect(isEmptyRecord("lot-memory", { on: false, batchId: "26J01-14" })).toBe(true);
    expect(isEmptyRecord("lot-memory", { on: true, batchId: "" })).toBe(true);
    expect(isEmptyRecord("lot-memory", { on: true, batchId: "26J01-14" })).toBe(false);
  });

  it("treats an empty grant list as empty and a populated one as present", () => {
    expect(isEmptyRecord("edit-grants", { grants: [] })).toBe(true);
    expect(isEmptyRecord("edit-grants", { grants: [{ entryKey: "a" }] })).toBe(false);
    expect(isEmptyRecord("report-presets", [])).toBe(true);
    expect(isEmptyRecord("custom-defects", [{ code: "X" }])).toBe(false);
  });
});

describe("parseKindRecord", () => {
  it("drops built-in presets and rejects a grant with no entry key", () => {
    const presets = parseKindRecord("report-presets", [
      { id: "builtin:gm-monthly", name: "GM", builtIn: true },
      { id: "user:1", name: "Mine", spec: { title: "Mine" } },
    ]);
    expect(presets.ok).toBe(true);
    if (presets.ok) expect(presets.record).toEqual([{ id: "user:1", name: "Mine", spec: { title: "Mine" } }]);
    expect(parseKindRecord("edit-grants", { grants: [{ entryKey: "" }] }).ok).toBe(false);
  });
});

describe("sharedStateMissing", () => {
  it("recognises a missing table and names the migration in the error", () => {
    expect(sharedStateMissing({ code: "42P01" })).toBe(true);
    expect(sharedStateMissing({ code: "PGRST205" })).toBe(true);
    expect(sharedStateMissing({ code: "42501" })).toBe(true);
    expect(sharedStateMissing({ message: 'relation "plant_shared_state" does not exist' })).toBe(true);
    expect(sharedStateMissing({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(SHARED_STATE_UNAVAILABLE_MESSAGE).toContain("20261031140000_plant_shared_state.sql");
  });
});

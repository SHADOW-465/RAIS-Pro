// Values the pre-wrapper code saved under moid_* / rais_* / disposafe_* keys
// must still be there after the move to lib/storage.ts — and a damaged one must
// not crash its reader.

import { readLotMemory } from "../entry/lot-memory";
import { readShiftWindowConfig, DEFAULT_SHIFT_WINDOWS } from "../entry/shift-window";
import { readDataEntryExportConfig } from "../entry/export-config";
import { loadShiftBatches } from "../entry/shift-batches";
import { readStoredPersona } from "../persona";
import { readLayout } from "../dashboard-layout";
import { loadDraft, saveDraft } from "../entry/draft";
import { listInvestigationRecents } from "../analytics/investigation-state";
import { sidebarCollapsed, customDefects, entryHeaderShift } from "../ui-prefs";

class MemoryStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as unknown as { window: unknown; localStorage: MemoryStorage; sessionStorage: MemoryStorage };
beforeEach(() => {
  g.window = g;
  g.localStorage = new MemoryStorage();
  g.sessionStorage = new MemoryStorage();
});
afterAll(() => {
  delete (g as { window?: unknown }).window;
});

test("old lot memory, shift windows, export config and persona are carried over", () => {
  g.localStorage.setItem("moid_lot_memory", JSON.stringify({ on: true, batchId: "26i21-14", batchDate: "2026-09-21", size: "14Fr" }));
  expect(readLotMemory()).toMatchObject({ on: true, batchId: "26I21-14", size: "14Fr" });
  expect(g.localStorage.getItem("moid_lot_memory")).toBeNull();
  expect(readLotMemory()?.batchId).toBe("26I21-14"); // now from the wrapped key

  g.localStorage.setItem("moid_shift_windows", JSON.stringify({ timezone: "Asia/Kolkata", windows: { "Day Shift": { start: "06:00", end: "18:00" } } }));
  expect(readShiftWindowConfig().windows["Day Shift"]).toEqual({ start: "06:00", end: "18:00" });

  g.localStorage.setItem("moid_data_entry_export", JSON.stringify({ mode: "audit-zip", channel: "all", useDateScope: true, from: "2026-04-01", to: "2026-09-30" }));
  expect(readDataEntryExportConfig()).toEqual({ mode: "audit-zip", channel: "all", useDateScope: true, from: "2026-04-01", to: "2026-09-30" });

  g.localStorage.setItem("moid_persona", "operator");
  expect(readStoredPersona()).toBe("operator");
});

test("old shift log, dashboard layout, drafts and UI prefs are carried over", () => {
  g.localStorage.setItem("disposafe_shift_batches", JSON.stringify([{ id: "a", date: "2026-09-21", batchId: "26I21-14", checked: 10 }]));
  expect(loadShiftBatches()).toHaveLength(1);

  g.localStorage.setItem("moid_dash_layout_v1_gm", JSON.stringify({ v: 1, order: ["kpis", "wip"], spans: { wip: 6 } }));
  expect(readLayout("gm")).toEqual({ order: ["kpis", "wip"], spans: { wip: 6 } });

  g.localStorage.setItem("moid_entry_draft_batch", JSON.stringify({ batchId: "26I21-14", checked: 5 }));
  expect(loadDraft<{ checked: number }>("moid_entry_draft_batch")?.checked).toBe(5);
  saveDraft("moid_entry_draft_batch", null);
  expect(loadDraft("moid_entry_draft_batch")).toBeNull();

  g.localStorage.setItem("rais_sidebar_collapsed", "true");
  expect(sidebarCollapsed.get()).toBe(true);
  g.localStorage.setItem("rais_hdr_shift", "Day Shift");
  expect(entryHeaderShift.get()).toBe("Day Shift");
  g.localStorage.setItem("rais_custom_defects", JSON.stringify([{ code: "X", label: "Odd", aliases: "" }]));
  expect(customDefects.get()).toEqual([{ code: "X", label: "Odd", aliases: "" }]);
});

test("damaged old values read as nothing instead of crashing or leaking through", () => {
  g.localStorage.setItem("moid_lot_memory", "{oops");
  expect(readLotMemory()).toBeNull();
  g.localStorage.setItem("moid_shift_windows", JSON.stringify({ windows: 5 }));
  expect(readShiftWindowConfig()).toEqual(DEFAULT_SHIFT_WINDOWS);
  g.localStorage.setItem("moid_persona", "root");
  expect(readStoredPersona()).toBe("gm");
  g.localStorage.setItem("disposafe_shift_batches", JSON.stringify([{ nope: true }]));
  expect(loadShiftBatches()).toEqual([]);
  g.localStorage.setItem("moid_investigation_recents", "[1,2]");
  expect(listInvestigationRecents()).toEqual([]);
});

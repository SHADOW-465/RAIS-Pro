import { logSummary, localDay } from "../log-summary";

const at = (h: number, day = 3) => new Date(2026, 10, day, h, 0, 0).toISOString();

test("counts today's direct-entry saves by ingestion, pending rows, and the latest save", () => {
  const today = localDay(new Date(2026, 10, 3, 12));
  const s = logSummary(
    [
      { extractedBy: "direct-entry", recordedAt: at(9), ingestionId: "a" },
      { extractedBy: "direct-entry", recordedAt: at(9), ingestionId: "a" }, // same save, 2 events
      { isDirectEntry: true, recordedAt: at(14), ingestionId: "b" },
      { extractedBy: "direct-entry", recordedAt: at(16, 2), ingestionId: "c" }, // yesterday
      { extractedBy: "heuristic", recordedAt: at(18), ingestionId: "x" }, // Excel, ignored
    ],
    [{ synced: true }, { synced: false }, {}],
    today,
  );
  expect(s).toEqual({ entriesToday: 2, pendingSync: 2, lastSaved: at(14) });
});

test("empty ledger", () => {
  expect(logSummary([], [], "2026-11-03")).toEqual({ entriesToday: 0, pendingSync: 0, lastSaved: null });
});

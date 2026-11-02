import { classifyAlert, groupAlerts, timelineBuckets, pageFromPath } from "../classify";
import type { PlantNotification } from "../types";

function n(over: Partial<PlantNotification> & { payload?: PlantNotification["payload"] }): PlantNotification {
  return {
    id: over.id ?? "1",
    type: over.type ?? "entry_exception",
    status: over.status ?? "open",
    title: over.title ?? "Counts do not balance",
    body: over.body ?? "Visual checked 100",
    createdAt: over.createdAt ?? "2026-08-15T10:00:00.000Z",
    updatedAt: over.updatedAt ?? "2026-08-15T10:00:00.000Z",
    createdBy: over.createdBy ?? "operator",
    targetPersona: over.targetPersona ?? "gm",
    payload: over.payload ?? {},
    history: over.history ?? [],
  };
}

test("pageFromPath maps data-entry and hold", () => {
  expect(pageFromPath("/log/entry")).toBe("data-entry");
  expect(pageFromPath("/lots/hold")).toBe("hold");
  expect(pageFromPath("/")).toBe("dashboard");
});

test("a Visual exception sits on Data Entry · Assembly · Visual", () => {
  const place = classifyAlert(
    n({ payload: { stageId: "visual", path: "/log/entry", reason: "x", date: "2026-08-15" } }),
  );
  expect(place.page).toBe("data-entry");
  expect(place.process).toBe("assembly");
  expect(place.stageId).toBe("visual");
  expect(place.stageLabel).toMatch(/Visual/i);
});

test("production-dipping alias is primary / Dipping", () => {
  const place = classifyAlert(n({ payload: { stageId: "production-dipping", path: "/log/entry" } }));
  expect(place.process).toBe("primary");
  expect(place.stageId).toBe("production");
});

test("groupAlerts by process then by stage", () => {
  const list = [
    n({ id: "a", payload: { stageId: "visual" } }),
    n({ id: "b", payload: { stageId: "balloon" } }),
    n({ id: "c", payload: { stageId: "production" } }),
  ];
  const byProcess = groupAlerts(list, "process");
  expect(byProcess.map((g) => g.key).sort()).toEqual(["assembly", "primary"]);
  const byStage = groupAlerts(list, "stage");
  expect(byStage.find((g) => g.key === "visual")?.items).toHaveLength(1);
});

test("timeline buckets by day, newest first", () => {
  const list = [
    n({ id: "a", createdAt: "2026-08-15T10:00:00.000Z" }),
    n({ id: "b", createdAt: "2026-08-16T10:00:00.000Z" }),
    n({ id: "c", createdAt: "2026-08-15T18:00:00.000Z" }),
  ];
  const days = timelineBuckets(list, "day");
  expect(days.map((d) => d.period)).toEqual(["2026-08-16", "2026-08-15"]);
  expect(days[1].items).toHaveLength(2);
});

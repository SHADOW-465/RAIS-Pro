import { buildOpenLots, requiredStations, PROCESS_ORDER } from "../open-lots";
import type { AuditEventLike } from "../audit-sessions";

const ev = (
  batch: string,
  stageId: string,
  day: string,
  extra: Partial<AuditEventLike> = {},
): AuditEventLike => ({
  eventType: "production",
  quantity: 100,
  stageId,
  batchNo: batch,
  occurredOn: { start: day, end: day },
  recordedAt: `${day}T08:00:00.000Z`,
  ...extra,
});

const LINE = [
  "production",
  "eye-punching",
  "secondary",
  "visual",
  "balloon",
  "valve-integrity",
  "final",
] as const;

const REQUIRED = [
  "production",
  "eye-punching",
  "hanging",
  "secondary",
  "visual",
  "balloon",
  "valve-integrity",
  "final",
] as const;

test("required stations are Dipping + secondary qty stations + four assembly gates", () => {
  const ids = requiredStations().map((s) => s.stageId);
  expect(ids).toEqual([...REQUIRED]);
  expect(PROCESS_ORDER).toEqual(["primary", "secondary", "assembly"]);
});

test("a lot that cleared every process is line-complete", () => {
  const events = LINE.map((s, i) => ev("26H01-16", s, `2026-08-0${i + 1}`));
  const r = buildOpenLots(events, { today: "2026-08-20", grain: "day" });
  expect(r.lineCompleteCount).toBe(1);
  expect(r.openCount).toBe(0);
  const lot = r.lots[0];
  expect(lot.lineComplete).toBe(true);
  expect(lot.waitingOn).toBeNull();
  expect(lot.processes.primary.complete).toBe(true);
  expect(lot.processes.secondary.complete).toBe(true);
  expect(lot.processes.assembly.complete).toBe(true);
});

test("assembly-only lot is open and waiting on Production Dipping", () => {
  const events = ["visual", "balloon", "valve-integrity", "final"].map((s, i) =>
    ev("26G31-14", s, `2026-07-2${i + 1}`),
  );
  const r = buildOpenLots(events, { today: "2026-08-20" });
  expect(r.openCount).toBe(1);
  expect(r.lots[0].waitingOn).toBe("primary");
  expect(r.lots[0].processes.assembly.complete).toBe(true);
  expect(r.lots[0].processes.primary.complete).toBe(false);
});

test("production-dipping alias counts as primary complete", () => {
  const r = buildOpenLots([ev("26H01-16", "production-dipping", "2026-08-01")], {
    today: "2026-08-02",
  });
  expect(r.lots[0].processes.primary.complete).toBe(true);
  expect(r.lots[0].waitingOn).toBe("secondary");
});

test("Eye Punching is Secondary 1/2; Eye Punching + Hanging is 2/2 complete", () => {
  const half = buildOpenLots(
    [ev("26H01-16", "production", "2026-08-01"), ev("26H01-16", "eye-punching", "2026-08-02")],
    { today: "2026-08-03" },
  );
  expect(half.lots[0].processes.secondary.done).toBe(1);
  expect(half.lots[0].processes.secondary.total).toBe(2);
  expect(half.lots[0].processes.secondary.complete).toBe(false);
  expect(half.lots[0].waitingOn).toBe("secondary");
  expect(half.lots[0].processes.secondary.nextStageId).toBe("hanging");

  const full = buildOpenLots(
    [
      ev("26H01-16", "production", "2026-08-01"),
      ev("26H01-16", "eye-punching", "2026-08-02"),
      ev("26H01-16", "hanging", "2026-08-03"),
    ],
    { today: "2026-08-04" },
  );
  expect(full.lots[0].processes.secondary.done).toBe(2);
  expect(full.lots[0].processes.secondary.complete).toBe(true);
  expect(full.lots[0].waitingOn).toBe("assembly");
});

test("Data Entry lumped Secondary Production completes Secondary without Eye Punching", () => {
  const r = buildOpenLots(
    [ev("26H01-16", "production", "2026-08-01"), ev("26H01-16", "secondary", "2026-08-02")],
    { today: "2026-08-03" },
  );
  expect(r.lots[0].processes.secondary.complete).toBe(true);
  expect(r.lots[0].waitingOn).toBe("assembly");
});

test("a lot with only Dipping is still waiting on Secondary", () => {
  const r = buildOpenLots([ev("26H01-16", "production", "2026-08-01")], { today: "2026-08-02" });
  expect(r.lots[0].processes.secondary.complete).toBe(false);
  expect(r.lots[0].waitingOn).toBe("secondary");
  const mix = r.processMix.find((p) => p.process === "secondary")!;
  expect(mix.complete).toBe(0);
  expect(mix.incomplete).toBe(1);
});

test("process mix counts complete vs incomplete among started lots", () => {
  const events = [
    ...LINE.map((s) => ev("DONE-14", s, "2026-08-01")),
    ev("OPEN-16", "production", "2026-08-02"),
  ];
  const r = buildOpenLots(events, { today: "2026-08-10" });
  const primary = r.processMix.find((p) => p.process === "primary")!;
  expect(primary.complete).toBe(2);
  expect(primary.incomplete).toBe(0);
  const assembly = r.processMix.find((p) => p.process === "assembly")!;
  expect(assembly.complete).toBe(1);
  expect(assembly.incomplete).toBe(1);
  const secondary = r.processMix.find((p) => p.process === "secondary")!;
  expect(secondary.complete).toBe(1);
  expect(secondary.incomplete).toBe(1);
});

test("cumulative completed trend counts a lot on the day the last gate ran", () => {
  const events = [
    ...LINE.map((s) => ev("A-14", s, "2026-08-01")),
    ...LINE.map((s) => ev("B-16", s, "2026-08-03")),
  ];
  const r = buildOpenLots(events, {
    today: "2026-08-10",
    grain: "day",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-03",
  });
  const values = r.completedTrend.map((p) => p.value);
  expect(values[0]).toBe(1);
  expect(values[values.length - 1]).toBe(2);
});

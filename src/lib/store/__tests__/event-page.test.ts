import type { Event } from "../types";
import {
  compareEvents,
  decodeEventCursor,
  defaultEventRange,
  encodeEventCursor,
  EventPageError,
  pageEvents,
  parseEventLimit,
} from "../event-page";

function row(eventId: string, recordedAt: string): Event {
  return { eventId, recordedAt } as Event;
}

test("defaultEventRange is the inclusive UTC span from today-30 through today", () => {
  expect(defaultEventRange(new Date("2026-10-31T15:04:00Z"))).toEqual({
    from: "2026-10-01",
    to: "2026-10-31",
  });
  expect(defaultEventRange(new Date("2026-03-01T00:30:00Z"))).toEqual({
    from: "2026-01-30",
    to: "2026-03-01",
  });
});

test("parseEventLimit clamps into 1..1000", () => {
  expect(parseEventLimit(null)).toBe(1000);
  expect(parseEventLimit("0")).toBe(1);
  expect(parseEventLimit("1001")).toBe(1000);
  expect(parseEventLimit("nope")).toBe(1000);
  expect(parseEventLimit("250")).toBe(250);
});

test("pages of 1000 cover every row once when recorded_at ties", () => {
  const stamp = "2026-07-04T00:00:00.000Z";
  const events = Array.from({ length: 1001 }, (_, i) => row(`e${String(i).padStart(4, "0")}`, stamp));
  // Shuffle so the input order is not the page order.
  events.reverse();
  const first = pageEvents(events, { limit: 1000 });
  expect(first.events).toHaveLength(1000);
  expect(first.nextCursor).toBeTruthy();
  const second = pageEvents(events, { limit: 1000, cursor: first.nextCursor });
  expect(second.events).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  const ids = [...first.events, ...second.events].map((e) => e.eventId);
  expect(ids).toEqual([...events].sort(compareEvents).map((e) => e.eventId));
  expect(new Set(ids).size).toBe(1001);
});

test("a cursor is strictly after its row when timestamps differ", () => {
  const events = [
    row("b", "2026-07-04T00:00:02.000Z"),
    row("a", "2026-07-04T00:00:01.000Z"),
    row("c", "2026-07-04T00:00:02.000Z"),
  ];
  const page = pageEvents(events, { limit: 2 });
  expect(page.events.map((e) => e.eventId)).toEqual(["a", "b"]);
  const rest = pageEvents(events, { limit: 2, cursor: page.nextCursor });
  expect(rest.events.map((e) => e.eventId)).toEqual(["c"]);
  expect(decodeEventCursor(encodeEventCursor(page.events[1]!))).toEqual({
    t: "2026-07-04T00:00:02.000Z",
    id: "b",
  });
});

test("a mangled cursor is rejected", () => {
  expect(() => pageEvents([row("a", "2026-01-01T00:00:00.000Z")], { cursor: "%%%" })).toThrow(EventPageError);
});

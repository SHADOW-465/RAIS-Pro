import { secondaryTrack } from "../secondary-track";

test("empty occupied is 0/2", () => {
  const t = secondaryTrack(new Set());
  expect(t).toMatchObject({ done: 0, total: 2, complete: false, started: false, nextStageId: "eye-punching" });
});

test("Eye Punching is 1/2; next is Hanging", () => {
  const t = secondaryTrack(new Set(["eye-punching"]));
  expect(t.done).toBe(1);
  expect(t.complete).toBe(false);
  expect(t.nextStageId).toBe("hanging");
});

test("Eye Punching + Hanging is 2/2 complete", () => {
  const t = secondaryTrack(new Set(["eye-punching", "hanging"]));
  expect(t.done).toBe(2);
  expect(t.complete).toBe(true);
  expect(t.nextStageId).toBeNull();
});

test("lumped Secondary Production fills both track slots", () => {
  const t = secondaryTrack(new Set(["secondary"]));
  expect(t.done).toBe(2);
  expect(t.complete).toBe(true);
});

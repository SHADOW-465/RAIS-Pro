import { ENTRY_LINE, groupByEntryLine } from "../entry-line";
import { resolveEntrySchema, stationsIn } from "../entry-schema";

const row = (stageId: string) => ({ stageId, checked: 10 });

test("groups follow the Data Entry structure, empty stations included", () => {
  const groups = groupByEntryLine([row("visual"), row("eye-punching")]);
  expect(groups.map((g) => g.label)).toEqual(["Production Dipping", "Secondary", "Assembly"]);
  expect(groups[0].stations.map((s) => [s.stageId, s.row])).toEqual([["stripping", null]]);
  expect(groups[1].stations.map((s) => s.label)).toEqual(["Eye Punching", "Hanging"]);
  expect(groups[1].stations[0].row).toEqual(row("eye-punching"));
  expect(groups[1].stations[1].row).toBeNull();
  expect(groups[2].stations.map((s) => s.stageId)).toEqual([
    "visual", "balloon", "valve-integrity", "final",
  ]);
});

test("stages that are not entry stations are dropped", () => {
  const groups = groupByEntryLine([row("production"), row("leaching"), row("gauge"), row("secondary")]);
  expect(groups.flatMap((g) => g.stations).every((s) => s.row === null)).toBe(true);
});

test("a stage alias lands on its canonical station", () => {
  const groups = groupByEntryLine([row("VISUAL INSPECTION")]);
  expect(groups[2].stations[0].row).not.toBeNull();
});

test("matches the stations the entry schema offers", () => {
  const schema = resolveEntrySchema(null);
  for (const lane of ENTRY_LINE) {
    expect(stationsIn(schema, lane.id).map((s) => s.stageId)).toEqual(lane.stageIds);
  }
});

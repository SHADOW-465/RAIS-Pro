import { resolveStageId } from "@/core/ontology/plant-catalog";
import { resolveEntrySchema, stationsIn } from "@/lib/entry/entry-schema";
import { defaultChangeStageId } from "../default-station";

test("the change station defaults to assembly Visual", () => {
  const schema = resolveEntrySchema(null);
  const id = defaultChangeStageId(schema);
  expect(resolveStageId(id)).toBe("visual");
  const assembly = stationsIn(schema, "assembly").map((s) => s.stageId);
  expect(assembly).toContain(id);
  expect(stationsIn(schema, "primary").length).toBeGreaterThan(0);
});

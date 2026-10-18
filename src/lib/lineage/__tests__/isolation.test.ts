import { readFileSync } from "node:fs";
import { join } from "node:path";

test("analytics barrel does not export lineage — KPIs cannot pick these rows up", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/analytics/index.ts"), "utf8");
  expect(src).not.toMatch(/lineage/);
  expect(src).not.toMatch(/batch-conversion/);
  expect(src).not.toMatch(/batch_conversions/);
});

test("ingest emit does not know about conversions", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/ingest/emit.ts"), "utf8");
  expect(src).not.toMatch(/lineage/);
  expect(src).not.toMatch(/batch_conversions/);
});

test("batch-id helpers were not rewritten for conversion", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/entry/batch-id.ts"), "utf8");
  expect(src).not.toMatch(/conversion/);
  expect(src).not.toMatch(/lineage/);
});

test("conversion page mounts two BatchMatrixEntry panels on the shared component", () => {
  const src = readFileSync(join(process.cwd(), "src/app/batch-conversion/page.tsx"), "utf8");
  expect(src).toMatch(/tone="source"/);
  expect(src).toMatch(/tone="converted"/);
  expect(src.match(/<BatchMatrixEntry/g)?.length).toBeGreaterThanOrEqual(2);
  expect(src).toMatch(/draftScope="conversion-source"/);
  expect(src).toMatch(/draftScope="conversion-converted"/);
  expect(src).toMatch(/identityLocked/);
});

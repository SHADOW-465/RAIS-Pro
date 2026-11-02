import { readFileSync } from "node:fs";
import { join } from "node:path";

test("dashboard Rejection Trend still opens the existing detail modal with the interactive chart", () => {
  const src = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  expect(src).toMatch(/RejectionTrendCard/);
  expect(src).toMatch(/RejectionTrendView/);
  expect(src).toMatch(/onOpenFullTrend/);
  expect(src).toMatch(/openModal\(`Rejection Trend/);
  expect(src).toMatch(/variant="detail"/);
  expect(src).toMatch(/FloatingDetailModal/);
  expect(src).not.toMatch(/href=["']\/trend/);
});

test("RejectionTrendCard keeps View full trend and treats Compare as an overlay toggle", () => {
  const src = readFileSync(join(process.cwd(), "src/components/app/RejectionTrendCard.tsx"), "utf8");
  expect(src).toMatch(/View full trend/);
  expect(src).toMatch(/onOpenFullTrend/);
  expect(src).toMatch(/label: "Line"/);
  expect(src).toMatch(/label: "Bar"/);
  expect(src).toMatch(/Compare/);
  expect(src).toMatch(/COMPARE_ON_KEY/);
  expect(src).toMatch(/parseCompareEnabled/);
  expect(src).toMatch(/compareOn/);
  expect(src).toMatch(/aria-pressed=\{compareOn\}/);
  expect(src).toMatch(/if \(!compareOn \|\| !events\.length \|\| points\.length === 0\) return \[\]/);
  expect(src).toMatch(/\{compareOn && \(/);
  expect(src).not.toMatch(/id: "compare"/);
  expect(src).not.toMatch(/mode === "compare"/);
  expect(src).not.toMatch(/href=["']\/trend/);
  expect(src).not.toMatch(/chart\.js/i);
});

test("trend-compare stays inside analytics and does not import lineage", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/analytics/trend-compare.ts"), "utf8");
  expect(src).toMatch(/rejectionRate/);
  expect(src).toMatch(/overlaySeries/);
  expect(src).not.toMatch(/lineage/);
  expect(src).not.toMatch(/batch_conversions/);
});

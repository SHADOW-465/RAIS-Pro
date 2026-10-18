import { niceYMax } from "../chart-utils";

test("a 0.20% peak (0.002) gets a 0.25% axis, not the 10% target", () => {
  expect(niceYMax(0.002)).toBeCloseTo(0.0025, 8);
});

test("zero / empty data still has a readable floor", () => {
  expect(niceYMax(0)).toBe(0.01);
});

test("a 2% peak rounds to 2.5%", () => {
  expect(niceYMax(0.02)).toBeCloseTo(0.025, 8);
});

test("a 22% peak (0.22) gets a 25% axis, eliminating 50% dead space", () => {
  expect(niceYMax(0.22)).toBeCloseTo(0.25, 8);
});


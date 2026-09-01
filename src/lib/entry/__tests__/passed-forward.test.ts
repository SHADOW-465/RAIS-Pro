import { passedForward } from "../passed-forward";

test("accept = checked − (rejected + hold)", () => {
  expect(passedForward({ checked: 1000, accepted: 800, rejected: 100, hold: 100 })).toBe(800);
  expect(passedForward({ checked: 1000, rejected: 100, hold: 100 })).toBe(800);
  expect(passedForward({ checked: 1650, accepted: 1450, rejected: 200 })).toBe(1450);
  expect(passedForward({ checked: 500 })).toBe(500);
});

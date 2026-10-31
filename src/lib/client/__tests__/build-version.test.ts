import { isNewBuild } from "../build-version";

test("flags a new build only when both ids are known and differ", () => {
  expect(isNewBuild("abc", "def")).toBe(true);
  expect(isNewBuild("abc", "abc")).toBe(false);
  expect(isNewBuild(null, "def")).toBe(false);
  expect(isNewBuild("abc", null)).toBe(false);
  expect(isNewBuild("abc", "")).toBe(false);
  expect(isNewBuild("abc", 5)).toBe(false);
});

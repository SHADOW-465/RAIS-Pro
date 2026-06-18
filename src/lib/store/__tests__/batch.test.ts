import { chunk } from "../batch";

describe("chunk", () => {
  it("splits an array into batches of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("returns a single batch when size >= length", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });
  it("returns an empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });
  it("handles exact multiples", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});

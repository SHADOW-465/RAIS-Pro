import { splitSegments, bridgeAt, MAX_BRIDGE_GAP } from "../chart-segments";

const L = (s: string) => [...s].map((c) => c === "x");

describe("splitSegments", () => {
  test("threshold is 3", () => expect(MAX_BRIDGE_GAP).toBe(3));

  test("continuous data is one run, no bridges", () => {
    expect(splitSegments(L("xxxx"))).toEqual({ runs: [[0, 1, 2, 3]], bridges: [] });
  });

  test("gaps of 1 to 3 empty periods are bridged", () => {
    expect(splitSegments(L("x.x")).bridges).toEqual([[0, 2]]);
    expect(splitSegments(L("x...x")).bridges).toEqual([[0, 4]]);
  });

  test("a gap of 4 or more stays a real break", () => {
    const s = splitSegments(L("xx....xx"));
    expect(s.runs).toEqual([[0, 1], [6, 7]]);
    expect(s.bridges).toEqual([]);
  });

  test("leading and trailing empties are never bridged or dotted", () => {
    const s = splitSegments(L("..xx.x.."));
    expect(s.runs).toEqual([[2, 3], [5]]);
    expect(s.bridges).toEqual([[3, 5]]);
  });

  test("respects the visible window", () => {
    expect(splitSegments(L("xxx.xxx"), 2, 4)).toEqual({ runs: [[2], [4]], bridges: [[2, 4]] });
  });

  test("all empty gives nothing", () => {
    expect(splitSegments(L("...."))).toEqual({ runs: [], bridges: [] });
  });

  test("custom threshold", () => {
    expect(splitSegments(L("x..x"), 0, 3, 1).bridges).toEqual([]);
  });
});

describe("bridgeAt", () => {
  test("finds the bridge covering an empty index only", () => {
    const b: [number, number][] = [[1, 4]];
    expect(bridgeAt(b, 2)).toEqual([1, 4]);
    expect(bridgeAt(b, 1)).toBeNull();
    expect(bridgeAt(b, 5)).toBeNull();
  });
});

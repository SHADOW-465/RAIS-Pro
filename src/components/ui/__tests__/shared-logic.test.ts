import { activeFilterCount, formatDelta, formatKpiValue, deltaFromArrowText, pageSlice, sortRows, toCsv, STATUS_META } from "../shared-logic";

describe("formatDelta", () => {
  it("marks a rejection-rate rise as bad", () => {
    expect(formatDelta(4.3, 3.1)).toEqual({ text: "+1.2 pp", direction: "up", good: false });
  });
  it("marks a fall as good when lower is better", () => {
    expect(formatDelta(1, 2)?.good).toBe(true);
  });
  it("percent change and divide-by-zero", () => {
    expect(formatDelta(150, 100, { unit: "%", lowerIsBetter: false })?.text).toBe("+50.0 %");
    expect(formatDelta(5, 0, { unit: "%" })).toBeNull();
  });
  it("flat and missing", () => {
    expect(formatDelta(2, 2)?.direction).toBe("flat");
    expect(formatDelta(NaN, 2)).toBeNull();
    expect(formatDelta(null, 2)).toBeNull();
  });
});

it("formatKpiValue never shows NaN/Infinity", () => {
  expect(formatKpiValue(NaN)).toBe("—");
  expect(formatKpiValue(Infinity)).toBe("—");
  expect(formatKpiValue(null)).toBe("—");
  expect(formatKpiValue(4.25, 1, "%")).toBe("4.3%");
  expect(formatKpiValue("Dipping")).toBe("Dipping");
});

it("every status has an icon and a word", () => {
  for (const m of Object.values(STATUS_META)) {
    expect(m.icon).toBeTruthy();
    expect(m.label).toBeTruthy();
  }
});

it("activeFilterCount ignores empties and defaults", () => {
  expect(activeFilterCount({ a: "", b: [], c: null, d: "x", e: "all" }, { e: "all" })).toBe(1);
});

describe("sortRows", () => {
  const rows = [{ k: 10 }, { k: null }, { k: 2 }];
  it("sorts numbers, nulls last in both directions", () => {
    expect(sortRows(rows, (r) => r.k, "asc").map((r) => r.k)).toEqual([2, 10, null]);
    expect(sortRows(rows, (r) => r.k, "desc").map((r) => r.k)).toEqual([10, 2, null]);
  });
  it("natural string order and stability", () => {
    const s = [{ id: "B10" }, { id: "B2" }];
    expect(sortRows(s, (r) => r.id, "asc").map((r) => r.id)).toEqual(["B2", "B10"]);
  });
});

it("pageSlice clamps the page", () => {
  const r = pageSlice([1, 2, 3, 4, 5], 99, 2);
  expect(r).toEqual({ rows: [5], page: 2, pages: 3 });
  expect(pageSlice([], 0, 2).pages).toBe(1);
});

it("toCsv escapes quotes/newlines and neutralises formulas", () => {
  expect(toCsv(["a", "b"], [['he said "hi"', "x\ny"], ["=1+1", 5]])).toBe('a,b\r\n"he said ""hi""","x\ny"\r\n\'=1+1,5');
});

it("deltaFromArrowText parses analytics delta text", () => {
  expect(deltaFromArrowText("↑ 0.30% vs Oct")).toEqual({ text: "0.30% vs Oct", direction: "up", good: false });
  expect(deltaFromArrowText("↓ 1.00% vs Oct")?.good).toBe(true);
  expect(deltaFromArrowText("↓ 1% vs Oct", false)?.good).toBe(false);
  expect(deltaFromArrowText("No prior period")).toBeNull();
  expect(deltaFromArrowText(undefined)).toBeNull();
});

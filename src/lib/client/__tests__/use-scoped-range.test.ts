import { globalRange } from "../use-scoped-range";

describe("globalRange", () => {
  it("is unbounded for the 'all' preset even if stale dates linger", () => {
    expect(globalRange({ datePreset: "all", dateFrom: "2026-01-01", dateTo: "2026-01-31" })).toEqual({ from: "", to: "" });
  });
  it("mirrors the chip window for any other preset", () => {
    expect(globalRange({ datePreset: "this-month", dateFrom: "2026-10-01", dateTo: "2026-10-31" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });
});

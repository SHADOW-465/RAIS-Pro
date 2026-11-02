import { scopeSummary } from "../scope-summary";

describe("scopeSummary", () => {
  it("joins only the controls the page shows", () => {
    expect(scopeSummary({ range: "This month", grain: "day", view: "Factory Overview", sources: "Plant default" }))
      .toBe("This month · Day · All lines · Plant default");
    expect(scopeSummary({ grain: "week" })).toBe("Week");
  });
  it("falls back to a neutral label, never blank", () => {
    expect(scopeSummary({})).toBe("Scope");
  });
});

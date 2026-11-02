import { resolveGuide, type GuideCtx } from "../resolve-guide";
import { parseDatePhrase } from "@/lib/analytics/date-phrase";
import type { Event } from "@/lib/store/types";

function ctx(over: Partial<GuideCtx> = {}): GuideCtx {
  return {
    events: [] as Event[],
    persona: "gm",
    dataMaxIso: "2025-08-15",
    ...over,
  };
}

describe("resolveGuide", () => {
  it("answers how-to for data entry with steps and an Open action", () => {
    const r = resolveGuide("How do I enter today's data?", ctx());
    expect(r.mode).toMatch(/howto|workflow/);
    expect(r.steps?.length).toBeGreaterThan(2);
    expect(r.actions.some((a) => a.href === "/log/entry")).toBe(true);
  });

  it("navigates to defect analysis on open request", () => {
    const r = resolveGuide("Open defect analysis", ctx());
    expect(r.mode).toBe("navigate");
    expect(r.actions[0]?.href).toBe("/quality/defect");
    expect(r.actions[0]?.auto).toBe(true);
  });

  it("analyzes July first week report and targets Reports with week scope", () => {
    const r = resolveGuide("I want to summarize july first week report", ctx());
    expect(r.mode).toBe("analyze");
    expect(r.analyze).toBeDefined();
    expect(r.analyze!.state.from).toBe("2025-07-01");
    expect(r.analyze!.state.to).toBe("2025-07-07");
    expect(r.actions[0]?.navKey).toBe("reports");
    expect(r.actions[0]?.auto).toBe(true);
  });

  it("explains plant schema on where-is", () => {
    const r = resolveGuide("Where is the plant schema?", ctx());
    expect(r.mode).toBe("howto");
    expect(r.actions[0]?.href).toBe("/setup/schema");
  });

  it("returns first-setup workflow for get started", () => {
    const r = resolveGuide("get started", ctx());
    expect(r.mode).toBe("workflow");
    expect(r.steps?.length).toBeGreaterThan(3);
  });
});

describe("july first week phrase (integration with guide)", () => {
  it("parseDatePhrase feeds the analyze path", () => {
    const p = parseDatePhrase("summarize july first week report", "2025-08-15");
    expect(p).toMatchObject({ from: "2025-07-01", to: "2025-07-07", grain: "week" });
  });
});

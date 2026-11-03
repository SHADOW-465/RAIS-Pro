import { roleStarterChips, splitAnswer } from "../suggestions";

test("four data questions per role; only write roles get the CAPA draft", () => {
  for (const p of ["gm", "owner", "operator"]) expect(roleStarterChips(p)).toHaveLength(4);
  expect(roleStarterChips("gm").map((c) => c.text)).toContain("Draft a CAPA for the top defect");
  expect(roleStarterChips("owner").map((c) => c.text)).not.toContain("Draft a CAPA for the top defect");
});

test("short answer first: first paragraph, rest behind Show details", () => {
  expect(splitAnswer("Rate is 4.1%.\n\nDipping drove it.\nSee Quality.")).toEqual({ short: "Rate is 4.1%.", more: "Dipping drove it.\nSee Quality." });
  expect(splitAnswer("  One line.  ")).toEqual({ short: "One line.", more: "" });
});

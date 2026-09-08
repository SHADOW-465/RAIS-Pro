import { orderDefectsByCatalog, type DefectRow } from "../defect";

const registry = {
  stages: [],
  defects: [
    { defectCode: "COAG", label: "Coagulum" },
    { defectCode: "SD", label: "Surface Defect" },
    { defectCode: "TT", label: "Thin Tip" },
  ],
  sizes: [],
} as any;

test("charts follow catalog hierarchy, not volume", () => {
  const rows: DefectRow[] = [
    { defectCode: "TT", label: "Thin Tip", rejected: 900, pct: 90, cumPct: 90 },
    { defectCode: "COAG", label: "Coagulum", rejected: 10, pct: 1, cumPct: 91 },
    { defectCode: "SD", label: "Surface Defect", rejected: 90, pct: 9, cumPct: 100 },
  ];
  expect(orderDefectsByCatalog(rows, registry).map((d) => d.defectCode)).toEqual([
    "COAG",
    "SD",
    "TT",
  ]);
});

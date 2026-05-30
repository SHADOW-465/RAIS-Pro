import * as XLSX from "xlsx";
import { parseWorkbookBuffer } from "@/lib/parser";
test("header detection skips title/blank preamble and normalizes headers", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["DISPOSAFE HEALTH AND LIFE CARE LIMITED","","",""],
    ["","","",""],
    ["DAILY VISUAL INSPECTION REPORT","","",""],
    ["DATE","VISUAL\nQTY","REJ\nQTY","REJ\nQTY"],  // real header, multiline + duplicate
    [45748,100,10,5],
    [45749,100,10,5],
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S");
  const buf = XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
  const { summaries } = parseWorkbookBuffer(buf,"f.xlsx");
  const names = summaries[0].columns.map(c=>c.name);
  expect(names).toContain("VISUAL QTY");          // \n collapsed to space
  expect(names.filter(n=>n.startsWith("REJ QTY")).length).toBe(2); // dup suffixed
  expect(names).toContain("REJ QTY (2)");
});

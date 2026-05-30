import * as XLSX from "xlsx";
import { parseWorkbookBuffer } from "@/lib/parser";
test("sums are exact, not rounded to 4 sig figs", () => {
  const ws = XLSX.utils.aoa_to_sheet([["REJ QTY"],[100001],[200003]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S");
  const buf = XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
  const { summaries } = parseWorkbookBuffer(buf,"f.xlsx");
  expect(summaries[0].columns.find(c=>c.name==="REJ QTY")!.sum).toBe(300004);
});

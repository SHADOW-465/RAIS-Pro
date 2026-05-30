import * as XLSX from "xlsx";
import { parseWorkbookBuffer } from "@/lib/parser";
test("excel-serial date column is not summed", () => {
  const ws = XLSX.utils.aoa_to_sheet([["DATE","REJ QTY"],[45748,10],[45749,20],[45750,30]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S");
  const buf = XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
  const { summaries } = parseWorkbookBuffer(buf,"f.xlsx");
  const cols = summaries[0].columns;
  expect(cols.find(c=>c.name==="DATE")!.type).toBe("date");
  expect(cols.find(c=>c.name==="DATE")!.sum).toBeUndefined();
  expect(cols.find(c=>c.name==="REJ QTY")!.sum).toBe(60);
});

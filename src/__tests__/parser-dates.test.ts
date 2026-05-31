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

test("5-digit quantity column is numeric, not a date", () => {
  const ws = XLSX.utils.aoa_to_sheet([["VISUAL QTY"],[10982],[11054],[12039]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S");
  const buf = XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
  const { summaries } = parseWorkbookBuffer(buf,"f.xlsx");
  const col = summaries[0].columns.find(c=>c.name==="VISUAL QTY")!;
  expect(col.type).toBe("number");
  expect(col.sum).toBe(34075);
});

test("numeric column with embedded text marker sums only the numbers", () => {
  const ws = XLSX.utils.aoa_to_sheet([["QTY"],[100],["HOLIDAY"],[200],[300]]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S");
  const buf = XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
  const { summaries } = parseWorkbookBuffer(buf,"f.xlsx");
  const col = summaries[0].columns.find(c=>c.name==="QTY")!;
  expect(col.type).toBe("number");
  expect(col.sum).toBe(600);
  expect(col.min).toBe(100);
  expect(col.max).toBe(300);
});

import * as XLSX from "xlsx";
import { parseWorkbookBuffer } from "@/lib/parser";
test("unlabeled subtotal and total rows are dropped", () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ["DATE","VISUAL QTY","REJ QTY"],
    [45748,100,10],
    ["",100,10],        // unlabeled subtotal — drop
    ["Total",200,20],   // labeled total — drop
  ]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S");
  const buf = XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
  const { summaries } = parseWorkbookBuffer(buf,"f.xlsx");
  expect(summaries[0].columns.find(c=>c.name==="VISUAL QTY")!.sum).toBe(100);
});

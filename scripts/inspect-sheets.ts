import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import * as XLSX from "xlsx";

const baseDir = "C:\\Users\\acer\\Documents\\MO!D\\New folder\\ANALYTICAL DATA\\SIZE WISE REJECTION";

function inspect() {
  if (!existsSync(baseDir)) {
    console.log("Directory does not exist:", baseDir);
    return;
  }
  const stages = ["FINAL", "VALVE INTEGRITY", "VISUAL"];
  for (const stg of stages) {
    const dir = join(baseDir, stg);
    if (!existsSync(dir)) continue;
    console.log(`\n=== Stage: ${stg} ===`);
    const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith(".xlsx"));
    for (const f of files) {
      console.log(`  File: ${f}`);
      try {
        const wb = XLSX.read(readFileSync(join(dir, f)));
        console.log(`    Sheets:`, wb.SheetNames.slice(0, 5));
        if (wb.SheetNames.length > 0) {
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          console.log(`    First row (header candidate):`, rows[0]?.slice(0, 10));
          console.log(`    Second row:`, rows[1]?.slice(0, 10));
          console.log(`    Third row:`, rows[2]?.slice(0, 10));
        }
      } catch (e: any) {
        console.log(`    Error:`, e.message);
      }
    }
  }
}

inspect();

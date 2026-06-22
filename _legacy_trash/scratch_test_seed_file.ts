// scratch/test_seed_file.ts
import { recordsFromBuffer } from "../src/lib/store/seed";
import { readFileSync } from "fs";
import path from "path";

const file = path.resolve("ANALYTICAL DATA/SIZE WISE REJECTION/VALVE INTEGRITY/1 APRIL 26.xlsx");
console.log("Reading file:", file);
const buf = readFileSync(file);
const records = recordsFromBuffer(buf, file);
console.log("Total records returned:", records.length);
if (records.length > 0) {
  console.log("First record:", JSON.stringify(records[0], null, 2));
  console.log("Unique dates:", [...new Set(records.map(r => r.record.occurredOn.start))].sort());
}

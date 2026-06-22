// scratch/query_rejections.ts
import { getStores } from "../src/lib/store";
import { seedFromDisk } from "../src/src/lib/store/seed";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function run() {
  const stores = getStores();
  console.log("Backend:", stores.backend);
  
  // Clear any existing memory events for testing or just wait for seed
  console.log("Seeding...");
  await seedFromDisk(stores.events);
  
  const events = await stores.events.effective();
  const rejections = events.filter(e => e.eventType === "rejection");
  console.log("Total events:", events.length);
  console.log("Total rejection events:", rejections.length);
  
  // Group by date and see what defects exist
  const byDate: Record<string, Record<string, number>> = {};
  for (const r of rejections as any[]) {
    const date = r.occurredOn.start;
    const code = r.defectCode || r.defectCodeRaw;
    if (!byDate[date]) byDate[date] = {};
    byDate[date][code] = (byDate[date][code] || 0) + r.quantity;
  }
  
  const dates = Object.keys(byDate).sort();
  console.log("Defect breakdown for first 5 dates:");
  for (const d of dates.slice(0, 10)) {
    console.log(`Date: ${d}`, byDate[d]);
  }
}

run().catch(console.error);

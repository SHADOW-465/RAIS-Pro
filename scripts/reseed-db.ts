// scripts/reseed-db.ts
import { getStores } from "../src/lib/store";
import { seedFromDisk } from "../src/lib/store/seed";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !serviceKey) {
  console.error("Missing Supabase configuration");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function run() {
  console.log("Clearing database tables (adjudications, findings, events)...");
  
  // Clear tables with a dummy condition since Supabase requires a filter for DELETE
  const { error: err1 } = await supabase.from("adjudications").delete().neq("adjudication_id", "");
  if (err1) console.warn("adjudications delete warn/error:", err1.message);
  
  const { error: err2 } = await supabase.from("findings").delete().neq("finding_id", "");
  if (err2) console.warn("findings delete warn/error:", err2.message);
  
  const { error: err3 } = await supabase.from("events").delete().neq("event_id", "");
  if (err3) console.warn("events delete warn/error:", err3.message);
  
  console.log("Tables cleared. Re-seeding from disk...");
  
  const stores = getStores();
  await seedFromDisk(stores.events);
  console.log("✓ Seeding complete.");
}

run().catch(err => {
  console.error("Reseed failed:", err);
  process.exit(1);
});

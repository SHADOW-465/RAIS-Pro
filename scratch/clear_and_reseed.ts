// scratch/clear_and_reseed.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getStores } from "../src/lib/store";
import { seedFromDisk } from "../src/lib/store/seed";
import { createServerClient } from "../src/lib/supabase";

async function run() {
  const stores = getStores();
  console.log("Backend:", stores.backend);
  
  if (stores.backend === "supabase") {
    console.log("Clearing Supabase database tables...");
    const client = createServerClient();
    
    const { error: err1 } = await client.from("rule_applications").delete().neq("rulebook_rule_id", "");
    if (err1) console.error("Error clearing rule_applications:", err1);
    
    const { error: err2 } = await client.from("adjudications").delete().neq("adjudication_id", "");
    if (err2) console.error("Error clearing adjudications:", err2);
    
    const { error: err3 } = await client.from("findings").delete().neq("finding_id", "");
    if (err3) console.error("Error clearing findings:", err3);
    
    const { error: err4 } = await client.from("events").delete().neq("event_id", "");
    if (err4) console.error("Error clearing events:", err4);
    
    console.log("Tables cleared.");
  } else {
    console.log("Using memory backend - clearing in-RAM event store...");
    (stores.events as any)._events = [];
  }
  
  console.log("Starting seeding...");
  await seedFromDisk(stores.events);
  
  const allEvents = await stores.events.effective();
  console.log("Seeding finished. Total events in database:", allEvents.length);
  
  const rejections = allEvents.filter(e => e.eventType === "rejection");
  const dates = [...new Set(rejections.map(e => e.occurredOn.start))].sort();
  console.log("Unique rejection dates (first 20):", dates.slice(0, 20));
}

run().catch(console.error);

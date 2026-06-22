// scratch/check_defects.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getStores } from "../src/lib/store";
import { defectTrend } from "../src/lib/analytics/defect";

async function run() {
  const stores = getStores();
  const events = await stores.events.effective();
  const trendScope = { grain: "month" as const };
  const dt = defectTrend(events, trendScope, 5);
  
  console.log("Defect trend points:");
  for (const pt of dt) {
    console.log(`Period: ${pt.period} (${pt.label}):`, pt.perDefect);
  }
}

run().catch(console.error);

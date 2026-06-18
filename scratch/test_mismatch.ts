// scratch/test_mismatch.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getStores } from "../src/lib/store";
import { byDefect, defectTrend } from "../src/lib/analytics/defect";

async function run() {
  const stores = getStores();
  const events = await stores.events.effective();
  
  const snapshotScope = { grain: "month" as const };
  const trendScope = { grain: "month" as const };
  
  const defects = byDefect(events, snapshotScope);
  const dt = defectTrend(events, trendScope, 5);
  
  const stages = defects.slice(0, 5).map((d) => ({ stageId: d.label, label: d.label }));
  
  console.log("Defect labels (stages):", stages);
  
  // For each trend point, print what is returned for each stageId
  for (const pt of dt) {
    const perStage = pt.perDefect;
    console.log(`Period ${pt.period}:`);
    for (const s of stages) {
      console.log(`  ${s.stageId}:`, perStage[s.stageId]);
    }
  }
}

run().catch(console.error);

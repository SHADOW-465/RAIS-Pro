// scripts/seed.ts
import { createClient } from "@supabase/supabase-js";
import { DISPOSAFE_REGISTRY } from "../src/lib/registry/disposafe";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("Seeding registries table...");
  const { error: regError } = await supabase.from("registries").upsert({
    client_id: DISPOSAFE_REGISTRY.clientId,
    registry_version: DISPOSAFE_REGISTRY.registryVersion,
    fiscal_year_start_month: DISPOSAFE_REGISTRY.fiscalYearStartMonth,
    stages: DISPOSAFE_REGISTRY.stages,
    defects: DISPOSAFE_REGISTRY.defects,
  });

  if (regError) {
    console.error("Error seeding registries:", regError);
    process.exit(1);
  }
  console.log("✓ Registries seeded successfully.");

  console.log("Seeding cost_config table...");
  const { error: costError } = await supabase.from("cost_config").upsert({
    client_id: DISPOSAFE_REGISTRY.clientId,
    enabled: false,
    currency: "INR",
    finished_unit_cost_inr: 20.0,
    per_stage: [
      { stageId: "visual", costPerUnitInr: 12.0 },
      { stageId: "balloon", costPerUnitInr: 13.0 },
      { stageId: "valve-integrity", costPerUnitInr: 17.0 },
      { stageId: "final", costPerUnitInr: 20.0 },
    ],
    rework_cost_per_unit_inr: 5.0,
  });

  if (costError) {
    console.error("Error seeding cost_config:", costError);
    process.exit(1);
  }
  console.log("✓ Cost config seeded successfully.");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

import { getStores } from "../src/lib/store";

async function test() {
  console.log("Initializing stores...");
  try {
    const stores = getStores();
    console.log("Backend:", stores.backend);
    const events = await stores.events.effective();
    console.log("Seeded event count:", events.length);
  } catch (err: any) {
    console.error("Error running test:", err);
  }
}

test();

import { createServerClient } from "../src/lib/supabase";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function check() {
  try {
    const client = createServerClient();
    const { data, error } = await client
      .from("events")
      .select("provenance_file")
      .limit(1);

    if (error) {
      console.log("Error or column doesn't exist:", error.message);
    } else {
      console.log("Success! Columns exist in events table:", data);
    }
  } catch (err: any) {
    console.error("Exception:", err.message);
  }
}

check();

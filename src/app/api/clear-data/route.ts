// src/app/api/clear-data/route.ts
// Operator "Clear Data" — wipes the entire canonical-event ledger. Destructive;
// invoked only from the Settings danger zone with an explicit confirmation.

import { NextResponse } from "next/server";
import { getStores } from "@/lib/store";

export async function POST() {
  try {
    const { events, backend } = getStores();
    const { deleted } = await events.clear();
    return NextResponse.json({ ok: true, deleted, backend });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Clear failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

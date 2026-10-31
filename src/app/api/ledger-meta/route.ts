// Cheap "has the plant data changed?" check. The browser polls it about once a
// minute and reloads its screens when `version` moves.
//
// GET  any signed-in role
//   200 { version, updatedAt, source: "db" }
//   503 { version: null, code: "ledger-meta-unavailable" }  migration not applied:
//       the browser reloads on a timer instead.

import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { withNoStore } from "@/lib/http/live-cache";
import { LedgerMetaUnavailableError, readLedgerMeta } from "@/lib/ledger-meta/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let warned = false;

async function getHandler(req: NextRequest) {
  const auth = await requireSession(req);
  if (!auth.ok) return auth.response;
  try {
    const meta = await readLedgerMeta();
    return NextResponse.json({ ...meta, source: "db" });
  } catch (err: unknown) {
    if (err instanceof LedgerMetaUnavailableError) {
      if (!warned) {
        warned = true;
        console.warn(err.message);
      }
      return NextResponse.json(
        { version: null, updatedAt: null, error: err.message, code: "ledger-meta-unavailable" },
        { status: 503 },
      );
    }
    console.warn("[ledger-meta] read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ version: null, updatedAt: null, error: "Could not read live-update state" }, { status: 500 });
  }
}

export const GET = withNoStore(getHandler);

import { withNoStore } from "@/lib/http/live-cache";
import { NextRequest, NextResponse } from "next/server";
import { getStores } from "@/lib/store";
import { buildEntryPackage } from "@/lib/transfer/entry-package";

/**
 * GET /api/entries/export?channel=direct-entry|all&from=&to=
 * Returns a downloadable JSON package for DB→DB transfer.
 */
async function getHandler(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const channel =
      sp.get("channel") === "all" ? ("all" as const) : ("direct-entry" as const);
    const from = sp.get("from") ?? undefined;
    const to = sp.get("to") ?? undefined;

    const { events: store, backend } = getStores();
    const all = await store.effective({ from, to });
    const pkg = buildEntryPackage(
      all,
      { channel, from, to },
      {
        companyId: process.env.MOID_COMPANY_ID ?? "default",
        backend,
      },
    );

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `moid-entries-${channel}-${stamp}.json`;

    return new NextResponse(JSON.stringify(pkg, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withNoStore(getHandler);

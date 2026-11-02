// The build this server is running. Open tabs compare it to the build they
// were loaded from and offer a reload when it moves (components/app/BuildWatcher).
// Public on purpose: it must also work on /login, and a commit hash is not a secret.

import { NextResponse } from "next/server";
import { withNoStore } from "@/lib/http/live-cache";

export const dynamic = "force-dynamic";

function getHandler() {
  return NextResponse.json({ buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null });
}

export const GET = withNoStore(getHandler);

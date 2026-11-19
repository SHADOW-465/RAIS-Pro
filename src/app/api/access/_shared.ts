import { NextResponse } from "next/server";
import { isClerkAuth } from "@/lib/auth/provider";

export function clerkRequiredResponse(): NextResponse | null {
  if (isClerkAuth()) return null;
  return NextResponse.json(
    { error: "Access management is only available when Clerk sign-in is on." },
    { status: 409 },
  );
}

export function fail(err: unknown): NextResponse {
  const status = (err as { status?: number }).status;
  const message = err instanceof Error ? err.message : "Request failed.";
  const code = typeof status === "number" && status >= 400 && status < 600 ? status : 500;
  if (code === 500) {
    // eslint-disable-next-line no-console
    console.error("[access]", err);
  }
  return NextResponse.json({ error: message }, { status: code });
}

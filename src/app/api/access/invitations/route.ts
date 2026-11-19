import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guard";
import { inviteUser, listPendingInvitations } from "@/lib/auth/clerk-access";
import { withNoStore } from "@/lib/http/live-cache";
import { clerkRequiredResponse, fail } from "../_shared";

async function getHandler(req: NextRequest) {
  const off = clerkRequiredResponse();
  if (off) return off;
  const guard = await requireCapability(req, "manageAccess");
  if (!guard.ok) return guard.response;
  try {
    const invitations = await listPendingInvitations();
    return NextResponse.json({ invitations });
  } catch (err) {
    return fail(err);
  }
}

export const GET = withNoStore(getHandler);

export async function POST(req: NextRequest) {
  const off = clerkRequiredResponse();
  if (off) return off;
  const guard = await requireCapability(req, "manageAccess");
  if (!guard.ok) return guard.response;
  try {
    let body: { email?: string; username?: string; role?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const invitation = await inviteUser({
      email: String(body.email ?? ""),
      username: String(body.username ?? ""),
      role: String(body.role ?? ""),
    });
    return NextResponse.json({ invitation }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

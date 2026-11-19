import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireCapability } from "@/lib/auth/guard";
import { updateUserAccess } from "@/lib/auth/clerk-access";
import { clerkRequiredResponse, fail } from "../../_shared";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const off = clerkRequiredResponse();
  if (off) return off;
  const guard = await requireCapability(req, "manageAccess");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await ctx.params;
    const { userId } = await auth();
    let body: { username?: string; role?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const user = await updateUserAccess(id, body, userId ?? null);
    return NextResponse.json({ user });
  } catch (err) {
    return fail(err);
  }
}

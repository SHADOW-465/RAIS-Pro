import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guard";
import { revokeInvitation } from "@/lib/auth/clerk-access";
import { clerkRequiredResponse, fail } from "../../_shared";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const off = clerkRequiredResponse();
  if (off) return off;
  const guard = await requireCapability(req, "manageAccess");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await ctx.params;
    await revokeInvitation(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

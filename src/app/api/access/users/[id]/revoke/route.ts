import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireCapability } from "@/lib/auth/guard";
import { revokeUserAccess } from "@/lib/auth/clerk-access";
import { clerkRequiredResponse, fail } from "../../../_shared";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const off = clerkRequiredResponse();
  if (off) return off;
  const guard = await requireCapability(req, "manageAccess");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await ctx.params;
    const { userId } = await auth();
    await revokeUserAccess(id, userId ?? null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

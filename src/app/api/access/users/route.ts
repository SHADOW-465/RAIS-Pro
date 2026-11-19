import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/guard";
import { listRoles } from "@/lib/auth/roles";
import { listAccessUsers } from "@/lib/auth/clerk-access";
import { withNoStore } from "@/lib/http/live-cache";
import { clerkRequiredResponse, fail } from "../_shared";

async function getHandler(req: NextRequest) {
  const off = clerkRequiredResponse();
  if (off) return off;
  const guard = await requireCapability(req, "manageAccess");
  if (!guard.ok) return guard.response;
  try {
    const [users, roles] = await Promise.all([listAccessUsers(), listRoles()]);
    return NextResponse.json({
      users,
      roles: roles
        .filter((r) => r.active)
        .map((r) => ({ roleId: r.roleId, label: r.label })),
    });
  } catch (err) {
    return fail(err);
  }
}

export const GET = withNoStore(getHandler);

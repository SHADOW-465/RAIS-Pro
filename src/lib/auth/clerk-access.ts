// Clerk Backend calls for the Access screen. Routes stay thin and guarded.

import { clerkClient } from "@clerk/nextjs/server";
import { ADMIN_ROLE_ID } from "@/lib/persona";
import { isAssignableRole, listRoles } from "./roles";
import { clearClerkActorCache, parseMoidMapping, type MoidMapping } from "./clerk-actor";
import {
  LAST_ADMIN_ERROR,
  adminCount,
  isLastAdmin,
  mappingOf,
  normalizeEmail,
  normalizeUsername,
  validateEmail,
  validateUsername,
  wouldRemoveLastAdmin,
  type MappedClerkUser,
} from "./access-admin";

export type AccessUserStatus = "mapped" | "unmapped" | "banned";

export type AccessUser = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  roleLabel: string | null;
  status: AccessUserStatus;
  lastSignInAt: string | null;
  banned: boolean;
};

export type AccessInvitation = {
  id: string;
  email: string;
  username: string | null;
  role: string | null;
  status: string;
  createdAt: string | null;
};

function emailOf(user: { emailAddresses?: { emailAddress?: string; id?: string }[]; primaryEmailAddressId?: string | null }): string | null {
  const list = user.emailAddresses ?? [];
  const primary = list.find((e) => e.id && e.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? list[0]?.emailAddress ?? null;
}

async function client() {
  return clerkClient();
}

async function allUsers() {
  const c = await client();
  const page = await c.users.getUserList({ limit: 100 });
  return page.data ?? [];
}

async function roleLabel(roleId: string | null): Promise<string | null> {
  if (!roleId) return null;
  const roles = await listRoles();
  return roles.find((r) => r.roleId === roleId)?.label ?? roleId;
}

export async function listAccessUsers(): Promise<AccessUser[]> {
  const users = await allUsers();
  const out: AccessUser[] = [];
  for (const u of users) {
    const mapping = mappingOf(u as MappedClerkUser);
    const banned = (u as { banned?: boolean }).banned === true;
    out.push({
      id: u.id,
      email: emailOf(u),
      username: mapping?.username ?? null,
      role: mapping?.role ?? null,
      roleLabel: await roleLabel(mapping?.role ?? null),
      status: banned ? "banned" : mapping ? "mapped" : "unmapped",
      lastSignInAt: u.lastSignInAt ? new Date(u.lastSignInAt).toISOString() : null,
      banned,
    });
  }
  return out;
}

export async function listPendingInvitations(): Promise<AccessInvitation[]> {
  const c = await client();
  const page = await c.invitations.getInvitationList({ status: "pending", limit: 100 });
  const rows = page.data ?? [];
  const out: AccessInvitation[] = [];
  for (const inv of rows) {
    const mapping = parseMoidMapping(inv.publicMetadata);
    out.push({
      id: inv.id,
      email: inv.emailAddress,
      username: mapping?.username ?? null,
      role: mapping?.role ?? null,
      status: String(inv.status),
      createdAt: inv.createdAt ? new Date(inv.createdAt).toISOString() : null,
    });
  }
  return out;
}

export async function inviteUser(input: {
  email: string;
  username: string;
  role: string;
}): Promise<AccessInvitation> {
  const emailErr = validateEmail(input.email);
  if (emailErr) throw Object.assign(new Error(emailErr), { status: 400 });
  const userErr = validateUsername(input.username);
  if (userErr) throw Object.assign(new Error(userErr), { status: 400 });
  const username = normalizeUsername(input.username);
  const role = input.role.trim();
  if (!(await isAssignableRole(role))) {
    throw Object.assign(new Error("That role does not exist or is switched off."), { status: 400 });
  }
  const c = await client();
  const inv = await c.invitations.createInvitation({
    emailAddress: normalizeEmail(input.email),
    publicMetadata: { moid: { username, role } },
    redirectUrl: "/login",
  });
  return {
    id: inv.id,
    email: inv.emailAddress,
    username,
    role,
    status: String(inv.status),
    createdAt: inv.createdAt ? new Date(inv.createdAt).toISOString() : null,
  };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const c = await client();
  await c.invitations.revokeInvitation(invitationId);
}

async function setMapping(userId: string, mapping: MoidMapping | null): Promise<void> {
  const c = await client();
  await c.users.updateUserMetadata(userId, {
    privateMetadata: { moid: mapping },
    publicMetadata: { moid: mapping },
  });
  clearClerkActorCache();
}

async function revokeSessions(userId: string): Promise<void> {
  const c = await client();
  const page = await c.sessions.getSessionList({ userId, limit: 100 });
  for (const s of page.data ?? []) {
    if (s.status === "active" || s.status === "pending") {
      try {
        await c.sessions.revokeSession(s.id);
      } catch {
        // Continue; one stale session must not block the revoke.
      }
    }
  }
}

export async function updateUserAccess(
  userId: string,
  patch: { username?: string; role?: string },
  actorUserId?: string | null,
): Promise<AccessUser> {
  const users = (await allUsers()) as unknown as MappedClerkUser[];
  const target = users.find((u) => u.id === userId);
  if (!target) throw Object.assign(new Error("User not found."), { status: 404 });

  const current = mappingOf(target);
  const username = patch.username != null ? normalizeUsername(patch.username) : current?.username;
  const role = patch.role != null ? patch.role.trim() : current?.role;
  if (!username || !role) {
    throw Object.assign(new Error("Username and role are required."), { status: 400 });
  }
  const userErr = validateUsername(username);
  if (userErr) throw Object.assign(new Error(userErr), { status: 400 });
  if (!(await isAssignableRole(role))) {
    throw Object.assign(new Error("That role does not exist or is switched off."), { status: 400 });
  }

  if (wouldRemoveLastAdmin(users, userId, role)) {
    throw Object.assign(new Error(LAST_ADMIN_ERROR), { status: 409 });
  }
  // Also stop an admin from demoting themselves when they are the last one,
  // even if the client sent the same user under a different path.
  if (actorUserId === userId && current?.role === ADMIN_ROLE_ID && role !== ADMIN_ROLE_ID && isLastAdmin(users, userId)) {
    throw Object.assign(new Error(LAST_ADMIN_ERROR), { status: 409 });
  }

  const c = await client();
  const u = await c.users.getUser(userId);
  if ((u as { banned?: boolean }).banned) {
    await c.users.unbanUser(userId);
  }
  await setMapping(userId, { username, role });

  const list = await listAccessUsers();
  const row = list.find((r) => r.id === userId);
  if (!row) throw Object.assign(new Error("User not found after update."), { status: 404 });
  return row;
}

export async function revokeUserAccess(userId: string, actorUserId?: string | null): Promise<void> {
  const users = (await allUsers()) as unknown as MappedClerkUser[];
  const target = users.find((u) => u.id === userId);
  if (!target) throw Object.assign(new Error("User not found."), { status: 404 });
  if (wouldRemoveLastAdmin(users, userId, null)) {
    throw Object.assign(new Error(LAST_ADMIN_ERROR), { status: 409 });
  }
  if (actorUserId === userId && isLastAdmin(users, userId)) {
    throw Object.assign(new Error(LAST_ADMIN_ERROR), { status: 409 });
  }
  await setMapping(userId, null);
  await revokeSessions(userId);
}

export { adminCount };

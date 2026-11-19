// Access management: last-admin protection and mapping helpers.
// Used by /api/access/*. Clerk I/O lives in the route handlers so tests can
// exercise these rules with plain objects.

import { ADMIN_ROLE_ID } from "@/lib/persona";
import { parseMoidMapping, type MoidMapping } from "./clerk-actor";

export const LAST_ADMIN_ERROR =
  "You are the last admin. Invite or promote another admin before changing or revoking your own access.";

export type MappedClerkUser = {
  id: string;
  privateMetadata?: unknown;
  publicMetadata?: unknown;
};

export function mappingOf(user: MappedClerkUser): MoidMapping | null {
  return parseMoidMapping(user.privateMetadata) ?? parseMoidMapping(user.publicMetadata);
}

export function isAdminMapping(mapping: MoidMapping | null): boolean {
  return mapping?.role === ADMIN_ROLE_ID;
}

export function adminCount(users: readonly MappedClerkUser[]): number {
  return users.filter((u) => isAdminMapping(mappingOf(u))).length;
}

/** True when this user is an admin and no other mapped admin exists. */
export function isLastAdmin(users: readonly MappedClerkUser[], userId: string): boolean {
  const self = users.find((u) => u.id === userId);
  if (!isAdminMapping(mappingOf(self ?? { id: userId }))) return false;
  return adminCount(users) <= 1;
}

/** Would this change remove the last remaining admin? */
export function wouldRemoveLastAdmin(
  users: readonly MappedClerkUser[],
  targetUserId: string,
  nextRole: string | null,
): boolean {
  if (!isLastAdmin(users, targetUserId)) return false;
  // Re-granting or keeping them as admin is fine.
  return nextRole !== ADMIN_ROLE_ID;
}

export function normalizeUsername(raw: string): string {
  return raw.trim();
}

export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 2) return "Username must be at least 2 characters.";
  if (u.length > 40) return "Username must be 40 characters or fewer.";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(u)) {
    return "Use letters, numbers, dot, dash or underscore; start with a letter or number.";
  }
  return null;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string): string | null {
  const e = normalizeEmail(raw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Enter a valid email address.";
  return null;
}

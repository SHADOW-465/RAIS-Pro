// Clerk identity → MOID actor.
//
// Clerk only answers "who is this person". The role they hold in MOID lives in
// that Clerk user's PRIVATE metadata, set by an admin, never by the user:
//
//   { moid: { username: string, role: RoleId } }
//
// Public and unsafe metadata are ignored. After the mapping is read, the same
// resolveRole / active checks used by the cookie session run, and the same
// Actor shape is returned, so the 32 API routes do not change.

import { auth, clerkClient } from "@clerk/nextjs/server";
import { resolveRole } from "./roles";
import type { Actor } from "./guard";

const CACHE_TTL_MS = 60_000;

export type MoidMapping = {
  username: string;
  role: string;
};

type CacheEntry = { at: number; mapping: MoidMapping | null };

const cache = new Map<string, CacheEntry>();

/** Test seam: drop the in-memory mapping cache. */
export function clearClerkActorCache(): void {
  cache.clear();
}

/** Pull a username + role out of Clerk private metadata, or null if absent/malformed. */
export function parseMoidMapping(privateMetadata: unknown): MoidMapping | null {
  if (!privateMetadata || typeof privateMetadata !== "object") return null;
  const moid = (privateMetadata as Record<string, unknown>).moid;
  if (!moid || typeof moid !== "object") return null;
  const rec = moid as Record<string, unknown>;
  const username = typeof rec.username === "string" ? rec.username.trim() : "";
  const role = typeof rec.role === "string" ? rec.role.trim() : "";
  if (!username || !role) return null;
  return { username, role };
}

async function mappingFor(userId: string): Promise<MoidMapping | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.mapping;
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const mapping = parseMoidMapping(user.privateMetadata);
  cache.set(userId, { at: Date.now(), mapping });
  return mapping;
}

/**
 * Resolve the signed-in Clerk user to a MOID Actor, or null when there is no
 * Clerk session, no mapping, or the mapped role is missing / inactive.
 */
export async function actorFromClerk(): Promise<Actor | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const mapping = await mappingFor(userId);
  if (!mapping) return null;
  const role = await resolveRole(mapping.role);
  if (!role || !role.active) return null;
  return {
    username: mapping.username,
    role: role.roleId,
    roleLabel: role.label,
    capabilities: role.capabilities,
  };
}

// Clerk identity → MOID actor.
//
// Clerk only answers "who is this person". The role they hold in MOID lives in
// that Clerk user's metadata, set by an admin, never by the user:
//
//   { moid: { username: string, role: RoleId } }
//
// Private metadata is the source of truth. Invitation public_metadata carries
// the same shape (Clerk copies it onto the user when they accept). On first
// authenticated request we promote a public-only mapping into private
// metadata. Unsafe metadata is ignored. After the mapping is read, the same
// resolveRole / active checks used by the cookie session run, and the same
// Actor shape is returned, so the API routes do not change.

import { auth, clerkClient } from "@clerk/nextjs/server";
import { resolveRole } from "./roles";
import type { Actor } from "./guard";

/** Positive mappings can live in memory for a minute. */
const MAPPED_CACHE_TTL_MS = 60_000;
/**
 * Do not pin a "not mapped yet" answer for long. Right after someone accepts
 * an invite, Clerk metadata can lag a moment; a 60s negative cache would keep
 * them on /no-access even after a retry.
 */
const UNMAPPED_CACHE_TTL_MS = 5_000;

export type MoidMapping = {
  username: string;
  role: string;
};

type CacheEntry = { at: number; mapping: MoidMapping | null };

const cache = new Map<string, CacheEntry>();

function ttlFor(mapping: MoidMapping | null): number {
  return mapping ? MAPPED_CACHE_TTL_MS : UNMAPPED_CACHE_TTL_MS;
}

/** Test seam: drop the in-memory mapping cache. */
export function clearClerkActorCache(): void {
  cache.clear();
}

/** Drop one user (after Settings → Access changes) or the whole table. */
export function invalidateClerkActorCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

type ClerkMetadataUser = {
  privateMetadata?: unknown;
  publicMetadata?: unknown;
  private_metadata?: unknown;
  public_metadata?: unknown;
};

/** Private first, then public. Accepts both SDK camelCase and REST snake_case. */
export function mappingsFromClerkUser(user: ClerkMetadataUser): {
  privateMapping: MoidMapping | null;
  publicMapping: MoidMapping | null;
} {
  return {
    privateMapping: parseMoidMapping(user.privateMetadata ?? user.private_metadata),
    publicMapping: parseMoidMapping(user.publicMetadata ?? user.public_metadata),
  };
}

/** Pull a username + role out of a Clerk metadata bag, or null if absent/malformed. */
export function parseMoidMapping(metadata: unknown): MoidMapping | null {
  if (!metadata || typeof metadata !== "object") return null;
  const moid = (metadata as Record<string, unknown>).moid;
  if (!moid || typeof moid !== "object") return null;
  const rec = moid as Record<string, unknown>;
  const username = typeof rec.username === "string" ? rec.username.trim() : "";
  const role = typeof rec.role === "string" ? rec.role.trim() : "";
  if (!username || !role) return null;
  // Keep the username as stored (e.g. "Lakshun"). Do not reject capitals.
  return { username, role };
}

async function mappingFor(userId: string): Promise<MoidMapping | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < ttlFor(hit.mapping)) return hit.mapping;
  const client = await clerkClient();
  const user = (await client.users.getUser(userId)) as ClerkMetadataUser;
  const { privateMapping, publicMapping } = mappingsFromClerkUser(user);
  const mapping = privateMapping ?? publicMapping;
  if (!privateMapping && publicMapping) {
    try {
      // Deep-merge; the JS client uses camelCase, same as @clerk/backend.
      await client.users.updateUserMetadata(userId, {
        privateMetadata: { moid: publicMapping },
      });
    } catch (err) {
      // Still honour the public mapping this request; promotion can retry later.
      console.error("[auth] Failed to promote Clerk public moid mapping to private metadata:", err);
    }
  }
  cache.set(userId, { at: Date.now(), mapping });
  return mapping;
}

/**
 * Resolve the signed-in Clerk user to a MOID Actor, or null when there is no
 * Clerk session, no mapping, or the mapped role is missing / inactive.
 */
export async function actorFromClerk(): Promise<Actor | null> {
  let userId: string | null | undefined;
  try {
    const session = await auth();
    userId = session.userId;
  } catch (err) {
    console.error("[auth] Clerk auth() failed while resolving the actor:", err);
    return null;
  }
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

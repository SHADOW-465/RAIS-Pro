// Roles, as rows instead of a union.
//
// `persona.ts` declared three roles as a TypeScript union, which meant adding a
// Supervisor or a QA role was a code change touching twenty-odd files, a
// session-token type and a Postgres CHECK constraint. A plant that wants one
// dashboard per line supervisor should not need a deploy.
//
// So a role is data now: `plant_roles` holds the same fields `PersonaDef`
// always had — label, home screen, allowed sidebar keys, capability bits — and
// the API boundary reads capabilities from here rather than from the union.
// Nothing about the capability MODEL changed; only where the answer comes from.
//
// ── Why this file is not lib/auth/config.ts ────────────────────────────────
// `src/proxy.ts` imports session.ts, which imports config.ts, and runs on every
// request in the Edge runtime. config.ts therefore has to stay a leaf that
// pulls in nothing but persona data — the last time it reached the Supabase
// client every route stopped resolving. This module reaches the database, so it
// is imported ONLY by guard.ts and by route handlers, never by session.ts,
// config.ts or the proxy. The proxy stays role-blind by design.
//
// ── Why a missing table is not an outage ───────────────────────────────────
// Reads degrade to the built-in definitions, exactly as plant_users degrades to
// "no named users". A deploy that has not run 20260910_plant_roles.sql behaves
// precisely as the app did before it existed, and a bad grant or a network blip
// cannot strip a signed-in GM of their capabilities mid-shift.

import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";
import { companyId } from "./config";
import { grantsFromRole, roleAccessFromGrants } from "@/lib/access/catalog";
import { EMPTY_SCOPE, parseScope, type RoleScope } from "@/lib/access/scope";
import {
  PERSONAS,
  PERSONA_ORDER,
  type NavKey,
  type PersonaCapabilities,
  type RoleId,
} from "@/lib/persona";

export interface RoleRecord {
  roleId: RoleId;
  label: string;
  title: string;
  initial: string;
  homeHref: string;
  /** Sidebar destinations this role may see. Deny by omission. */
  navAllow: NavKey[];
  capabilities: PersonaCapabilities;
  /** Every granted leaf id — see lib/access/catalog.ts. Redundant with
   *  navAllow + capabilities by construction; the only home for grants that
   *  are neither, dashboard cards today. */
  grants: string[];
  /** Which stages this role's data is limited to. Empty = the whole plant.
   *  Enforced at /api/events, not in the browser. */
  scope: RoleScope;
  /** Seeded with the app; may be edited, never deleted. */
  builtin: boolean;
  active: boolean;
  sortOrder: number;
}

/** The three built-ins, projected from persona.ts so there is one source. */
export const BUILTIN_ROLES: Record<string, RoleRecord> = Object.fromEntries(
  PERSONA_ORDER.map((id, i) => {
    const p = PERSONAS[id];
    return [
      id,
      {
        roleId: id,
        label: p.label,
        title: p.title,
        initial: p.initial,
        homeHref: p.homeHref,
        navAllow: [...p.navAllow],
        capabilities: { ...p.capabilities },
        grants: [...grantsFromRole(p)],
        scope: EMPTY_SCOPE,
        builtin: true,
        active: true,
        sortOrder: i * 10,
      } satisfies RoleRecord,
    ];
  }),
);

export interface RoleStore {
  list(companyId: string): Promise<RoleRecord[]>;
  find(companyId: string, roleId: RoleId): Promise<RoleRecord | null>;
  upsert(companyId: string, role: RoleRecord): Promise<void>;
  remove(companyId: string, roleId: RoleId): Promise<boolean>;
}

const builtinList = (): RoleRecord[] =>
  PERSONA_ORDER.map((id) => BUILTIN_ROLES[id]);

/** MOID_STORE=memory (and every test). Built-ins only — a plant that wants
 *  custom roles is running against Supabase. */
class MemoryRoleStore implements RoleStore {
  private extra = new Map<string, Map<RoleId, RoleRecord>>();
  private of(company: string) {
    let m = this.extra.get(company);
    if (!m) this.extra.set(company, (m = new Map()));
    return m;
  }
  async list(company: string) {
    return [...builtinList(), ...this.of(company).values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.roleId.localeCompare(b.roleId),
    );
  }
  async find(company: string, roleId: RoleId) {
    return this.of(company).get(roleId) ?? BUILTIN_ROLES[roleId] ?? null;
  }
  async upsert(company: string, role: RoleRecord) {
    this.of(company).set(role.roleId, role);
  }
  async remove(company: string, roleId: RoleId) {
    return this.of(company).delete(roleId);
  }
  /** Tests and local seeding. */
  __put(company: string, role: RoleRecord) {
    this.of(company).set(role.roleId, role);
  }
}

const asStringArray = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];

const rowToRole = (r: Record<string, unknown>): RoleRecord => {
  const caps = (r.capabilities ?? {}) as Record<string, unknown>;
  return {
    roleId: String(r.role_id),
    label: String(r.label ?? r.role_id),
    title: String(r.title ?? ""),
    initial: String(r.initial ?? String(r.role_id).charAt(0).toUpperCase()),
    homeHref: String(r.home_href ?? "/"),
    navAllow: asStringArray(r.nav_allow) as NavKey[],
    grants: asStringArray(r.grants),
    scope: parseScope(r.scope),
    capabilities: {
      write: caps.write === true,
      approve: caps.approve === true,
      configure: caps.configure === true,
      eraseLedger: caps.eraseLedger === true,
    },
    builtin: r.builtin === true,
    active: r.active !== false,
    sortOrder: typeof r.sort_order === "number" ? r.sort_order : 100,
  };
};

/** Writes must not fail silently: a GM told nothing would believe the role was
 *  saved. Reads degrade instead — see the header. */
export const MISSING_ROLES_TABLE =
  "The plant_roles table does not exist yet. Apply supabase/migrations/20260910_plant_roles.sql, then try again.";

/** Same degrade-on-read posture as plant_users: a table that is absent or
 *  unreadable means "no custom roles", never a 500 on a guarded route. */
function isReadUnavailable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const msg = String((err as { message?: string } | null)?.message ?? "");
  return (
    code === "42P01" || // undefined_table
    code === "PGRST205" || // PostgREST schema cache: table not found
    code === "42501" || // insufficient_privilege
    (/plant_roles/i.test(msg) && /does not exist|not find|schema cache/i.test(msg))
  );
}

let warnedUnreadable = false;
function warnUnreadable(err: unknown): void {
  if (warnedUnreadable) return;
  warnedUnreadable = true;
  // eslint-disable-next-line no-console
  console.error("[auth] plant_roles unreadable, falling back to built-in roles:", err);
}

class SupabaseRoleStore implements RoleStore {
  private get client() {
    return createServerClient();
  }
  async list(company: string) {
    const { data, error } = await this.client
      .from("plant_roles")
      .select("*")
      .eq("company_id", company)
      .order("sort_order");
    if (error) {
      if (isReadUnavailable(error)) {
        warnUnreadable(error);
        return builtinList();
      }
      throw error;
    }
    const rows = (data ?? []).map(rowToRole);
    // A migration that has not been seeded yet must still know the built-ins.
    const seen = new Set(rows.map((r) => r.roleId));
    return [...rows, ...builtinList().filter((r) => !seen.has(r.roleId))].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.roleId.localeCompare(b.roleId),
    );
  }
  async find(company: string, roleId: RoleId) {
    const { data, error } = await this.client
      .from("plant_roles")
      .select("*")
      .eq("company_id", company)
      .eq("role_id", roleId)
      .maybeSingle();
    if (error) {
      if (isReadUnavailable(error)) {
        warnUnreadable(error);
        return BUILTIN_ROLES[roleId] ?? null;
      }
      throw error;
    }
    return data ? rowToRole(data) : (BUILTIN_ROLES[roleId] ?? null);
  }
  async upsert(company: string, role: RoleRecord) {
    const { error } = await this.client.from("plant_roles").upsert(
      {
        company_id: company,
        role_id: role.roleId,
        label: role.label,
        title: role.title,
        initial: role.initial,
        home_href: role.homeHref,
        nav_allow: role.navAllow,
        capabilities: role.capabilities,
        grants: role.grants,
        scope: role.scope,
        builtin: role.builtin,
        active: role.active,
        sort_order: role.sortOrder,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,role_id" },
    );
    if (error) throw new Error(isReadUnavailable(error) ? MISSING_ROLES_TABLE : error.message);
  }
  async remove(company: string, roleId: RoleId) {
    const { error, count } = await this.client
      .from("plant_roles")
      .delete({ count: "exact" })
      .eq("company_id", company)
      .eq("role_id", roleId);
    if (error) throw new Error(isReadUnavailable(error) ? MISSING_ROLES_TABLE : error.message);
    return (count ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __moidRoleStore?: RoleStore };

export function getRoleStore(): RoleStore {
  if (!g.__moidRoleStore) {
    g.__moidRoleStore = shouldUseSupabase() ? new SupabaseRoleStore() : new MemoryRoleStore();
  }
  return g.__moidRoleStore;
}

/** Tests only. */
export function __resetRoleStoreForTests(): void {
  delete g.__moidRoleStore;
  cache.clear();
}

/** Tests and local seeding only — real creation arrives with the roles UI. */
export function __seedRoleForTests(role: RoleRecord, company = companyId()): void {
  const store = getRoleStore();
  if (store instanceof MemoryRoleStore) store.__put(company, role);
  invalidateRoleCache();
}

// ── Resolution ──────────────────────────────────────────────────────────────
// `requireCapability` sits on every mutating request, so an uncached lookup
// would put a database round-trip in front of every entry save. The cache is
// deliberately short and small: a revoked capability must stop working within
// a few seconds without anyone having to sign out.

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { role: RoleRecord | null; at: number }>();

export function invalidateRoleCache(): void {
  cache.clear();
}

/**
 * The definition behind a session's role id, or null if no such role.
 *
 * The database wins when it has an answer — that is what makes a role editable
 * — and the built-in definition is the fallback, which is what makes it
 * impossible to lock a GM out by breaking the table.
 */
export async function resolveRole(roleId: RoleId): Promise<RoleRecord | null> {
  if (!roleId) return null;
  const company = companyId();
  const key = `${company} ${roleId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.role;

  let role: RoleRecord | null;
  try {
    role = await getRoleStore().find(company, roleId);
  } catch (err) {
    // A store that throws for a reason `isReadUnavailable` did not recognise
    // still must not take the API down. Built-in or nothing.
    warnUnreadable(err);
    role = BUILTIN_ROLES[roleId] ?? null;
  }
  cache.set(key, { role, at: Date.now() });
  return role;
}

/** Every role a GM may assign. Built-ins are always in the list. */
export async function listRoles(): Promise<RoleRecord[]> {
  try {
    return await getRoleStore().list(companyId());
  } catch (err) {
    warnUnreadable(err);
    return builtinList();
  }
}

/** True when `roleId` names a role that exists and may still be signed into. */
export async function isAssignableRole(roleId: RoleId): Promise<boolean> {
  const role = await resolveRole(roleId);
  return !!role && role.active;
}

// ── Mutation ────────────────────────────────────────────────────────────────
// Validation and persistence only. Rules that need to know about USERS — may
// this role be deleted while people hold it, is the caller about to remove
// their own administration rights — live in /api/roles, because users.ts
// already imports this module and the reverse edge would be a cycle.

/** Role ids get typed into URLs, config and SQL. Same shape as a username. */
export function normalizeRoleId(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ".");
}

export function validateRoleId(raw: string): string | null {
  const id = normalizeRoleId(raw);
  if (id.length < 2) return "Role id must be at least 2 characters.";
  if (id.length > 40) return "Role id must be 40 characters or fewer.";
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
    return "Use letters, numbers, dot, dash or underscore; start with a letter or number.";
  }
  return null;
}

/** Build a stored role from a set of ticked grants. The three access columns
 *  are always written together, from one source, so they cannot disagree. */
export function roleFromGrants(
  base: Omit<RoleRecord, "navAllow" | "capabilities" | "grants">,
  granted: ReadonlySet<string>,
): RoleRecord {
  return { ...base, ...roleAccessFromGrants(granted) };
}

export async function saveRole(role: RoleRecord): Promise<void> {
  await getRoleStore().upsert(companyId(), role);
  invalidateRoleCache();
}

export async function deleteRole(roleId: RoleId): Promise<boolean> {
  const ok = await getRoleStore().remove(companyId(), normalizeRoleId(roleId));
  invalidateRoleCache();
  return ok;
}

/** Roles that can still administer the plant. Deleting or deactivating the
 *  last one leaves nobody able to create users, edit the schema, or undo it. */
export async function rolesWithConfigure(): Promise<RoleRecord[]> {
  return (await listRoles()).filter((r) => r.active && r.capabilities.configure);
}

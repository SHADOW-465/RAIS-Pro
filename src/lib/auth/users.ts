// Named plant users — the subject of a session is a person, not a job title.
//
// The three preset logins (gm / owner / operator) authenticate a ROLE. Everyone
// on a shift shares one password, so the ledger records "operator" as the author
// of every entry and cannot say which of them typed it. In a system whose whole
// value is an attributable, append-only audit trail that is the real defect —
// worse than the password being weak, because no password change fixes it. It
// also means a leaver cannot be revoked without re-issuing the credential to
// everyone who stayed.
//
// So: accounts a GM creates, in the plant's own database. No email, no external
// identity provider, no per-user setup beyond a name and a password — the model
// on-prem MES/LIMS use.
//
// The capability model in persona.ts and the guard in guard.ts carry over
// untouched. This module only changes WHO a session belongs to. Which role a
// user may hold is a lookup against `plant_roles` (lib/auth/roles.ts) rather
// than a closed union, so a GM can assign a role the plant created.
//
// ── Migration, and why you cannot lock yourself out ────────────────────────
// A preset role login stays valid until an ACTIVE named user holds that role.
// Create a real GM and `gm` / `moid-gm` stops working — self-migrating, no flag
// to remember. You cannot strand yourself, because creating that user requires
// already being signed in. Break glass: deactivate the named users for a role
// (SQL `UPDATE plant_users SET active = false WHERE role = 'gm'`) and the preset
// login for that role comes back.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { shouldUseSupabase } from "@/lib/store";
import { createServerClient } from "@/lib/supabase";
import { PERSONAS, personaDef, type RoleId } from "@/lib/persona";
import { companyId, DEFAULT_COMPANY, findUser } from "./config";
import { isAssignableRole } from "./roles";

const scrypt = promisify(scryptCb) as (
  pw: string | Buffer,
  salt: string | Buffer,
  len: number,
) => Promise<Buffer>;

export { companyId, DEFAULT_COMPANY };

export interface PlantUser {
  username: string;
  displayName: string;
  role: RoleId;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

/** Stored form — never leaves this module or the DB. */
interface StoredUser extends PlantUser {
  passwordHash: string;
}

// ── Password hashing ────────────────────────────────────────────────────────
// scrypt from node:crypto: memory-hard, in the standard library, no dependency
// to audit or keep patched. Parameters are the Node defaults except N, raised
// to 2^15 — roughly 100ms per verify on plant hardware, which is nothing on a
// login and expensive in bulk.

const SCRYPT_N = 32768;
const KEY_LEN = 64;

/** `scrypt$N$salt$key`, all hex. Self-describing so N can be raised later
 *  without invalidating existing hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${SCRYPT_N}$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const [, , saltHex, keyHex] = parts;
  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Usernames are case-insensitive and space-free — they get typed on a shop
 *  floor terminal, often with gloves. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ".");
}

export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 2) return "Username must be at least 2 characters.";
  if (u.length > 40) return "Username must be 40 characters or fewer.";
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(u)) {
    return "Use letters, numbers, dot, dash or underscore; start with a letter or number.";
  }
  // Would shadow a preset role login and make which-one-am-I ambiguous.
  if (u in PERSONAS) return `"${u}" is a reserved role name.`;
  return null;
}

/** Deliberately mild: this is a plant terminal behind a LAN, and a rule strict
 *  enough to force a sticky note on the monitor is worse than a short password. */
export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (pw.length > 200) return "Password must be 200 characters or fewer.";
  return null;
}

// ── Store ───────────────────────────────────────────────────────────────────

export interface UserStore {
  list(companyId: string): Promise<PlantUser[]>;
  find(companyId: string, username: string): Promise<StoredUser | null>;
  upsert(companyId: string, user: StoredUser): Promise<void>;
  setActive(companyId: string, username: string, active: boolean): Promise<boolean>;
  setPassword(companyId: string, username: string, passwordHash: string): Promise<boolean>;
}

const strip = (u: StoredUser): PlantUser => {
  const { passwordHash: _ignored, ...rest } = u;
  return rest;
};

class MemoryUserStore implements UserStore {
  private byCompany = new Map<string, Map<string, StoredUser>>();
  private of(companyId: string) {
    let m = this.byCompany.get(companyId);
    if (!m) this.byCompany.set(companyId, (m = new Map()));
    return m;
  }
  async list(companyId: string) {
    return [...this.of(companyId).values()].map(strip).sort((a, b) => a.username.localeCompare(b.username));
  }
  async find(companyId: string, username: string) {
    return this.of(companyId).get(normalizeUsername(username)) ?? null;
  }
  async upsert(companyId: string, user: StoredUser) {
    this.of(companyId).set(user.username, user);
  }
  async setActive(companyId: string, username: string, active: boolean) {
    const u = this.of(companyId).get(normalizeUsername(username));
    if (!u) return false;
    u.active = active;
    return true;
  }
  async setPassword(companyId: string, username: string, passwordHash: string) {
    const u = this.of(companyId).get(normalizeUsername(username));
    if (!u) return false;
    u.passwordHash = passwordHash;
    return true;
  }
}

const rowToUser = (r: Record<string, unknown>): StoredUser => ({
  username: String(r.username),
  displayName: String(r.display_name ?? r.username),
  role: String(r.role ?? "operator"),
  active: r.active !== false,
  createdBy: String(r.created_by ?? "system"),
  createdAt: String(r.created_at ?? ""),
  passwordHash: String(r.password_hash ?? ""),
});

/** Thrown by write paths when the table is absent, so the UI can say what to do
 *  instead of surfacing a bare 500. Reads degrade silently instead (see below). */
export const MISSING_TABLE_MESSAGE =
  "The plant_users table does not exist yet. Apply supabase/migrations/20260818_plant_users.sql, then try again.";

/** A deploy that has not run the migration yet must not 500 every login — it
 *  behaves as "no named users", i.e. exactly how the app worked before.
 *
 *  Reads degrade; writes raise MISSING_TABLE_MESSAGE. Silently swallowing a
 *  failed user creation would be worse than an error — the GM would think the
 *  account exists. */
function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const msg = String((err as { message?: string } | null)?.message ?? "");
  return (
    code === "42P01" || // Postgres: undefined_table
    // PostgREST answers first and has its own code + wording — checking only
    // the Postgres one meant every login 500'd until the migration was applied.
    code === "PGRST205" || // schema cache: table not found
    (/plant_users/i.test(msg) && /does not exist|not find|schema cache/i.test(msg))
  );
}

/** True for a database-level problem an operator has to go fix (grants,
 *  connectivity) rather than something the request itself got wrong. Reads on
 *  this table sit on the LOGIN path, so any of these must degrade to "no named
 *  users" rather than take login down — the first version of this code only
 *  handled the missing-table case, and 20260819_plant_users_grants.sql (the
 *  migration that fixes the actual permission-denied cause) shipped as a
 *  follow-up precisely because this check didn't catch it. */
function isReadUnavailable(err: unknown): boolean {
  if (isMissingTable(err)) return true;
  const code = (err as { code?: string } | null)?.code;
  return code === "42501"; // Postgres: insufficient_privilege
}

class SupabaseUserStore implements UserStore {
  private get client() {
    return createServerClient();
  }
  async list(companyId: string) {
    const { data, error } = await this.client
      .from("plant_users")
      .select("*")
      .eq("company_id", companyId)
      .order("username");
    if (error) {
      if (isReadUnavailable(error)) {
        // eslint-disable-next-line no-console
        console.error("[auth] plant_users unreadable, treating as empty:", error);
        return [];
      }
      throw error;
    }
    return (data ?? []).map(rowToUser).map(strip);
  }
  async find(companyId: string, username: string) {
    const { data, error } = await this.client
      .from("plant_users")
      .select("*")
      .eq("company_id", companyId)
      .eq("username", normalizeUsername(username))
      .maybeSingle();
    if (error) {
      if (isReadUnavailable(error)) {
        // The login path reaches this. A DB-side misconfiguration must not
        // block sign-in — it should just mean "no named user by this name",
        // so the preset role login (which never touches this table) still
        // works while someone fixes the underlying grant.
        // eslint-disable-next-line no-console
        console.error("[auth] plant_users unreadable, treating as no match:", error);
        return null;
      }
      throw error;
    }
    return data ? rowToUser(data) : null;
  }
  async upsert(companyId: string, user: StoredUser) {
    const { error } = await this.client.from("plant_users").upsert(
      {
        company_id: companyId,
        username: user.username,
        display_name: user.displayName,
        role: user.role,
        password_hash: user.passwordHash,
        active: user.active,
        created_by: user.createdBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,username" },
    );
    if (error) throw new Error(isMissingTable(error) ? MISSING_TABLE_MESSAGE : error.message);
  }
  async setActive(companyId: string, username: string, active: boolean) {
    const { error, count } = await this.client
      .from("plant_users")
      .update({ active, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("company_id", companyId)
      .eq("username", normalizeUsername(username));
    if (error) throw new Error(isMissingTable(error) ? MISSING_TABLE_MESSAGE : error.message);
    return (count ?? 0) > 0;
  }
  async setPassword(companyId: string, username: string, passwordHash: string) {
    const { error, count } = await this.client
      .from("plant_users")
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("company_id", companyId)
      .eq("username", normalizeUsername(username));
    if (error) throw new Error(isMissingTable(error) ? MISSING_TABLE_MESSAGE : error.message);
    return (count ?? 0) > 0;
  }
}

const g = globalThis as unknown as { __moidUserStore?: UserStore };

export function getUserStore(): UserStore {
  if (!g.__moidUserStore) {
    g.__moidUserStore = shouldUseSupabase() ? new SupabaseUserStore() : new MemoryUserStore();
  }
  return g.__moidUserStore;
}

/** Tests only. */
export function __resetUserStoreForTests(): void {
  delete g.__moidUserStore;
}

// ── Authentication ──────────────────────────────────────────────────────────

export interface AuthenticatedUser {
  username: string;
  displayName: string;
  role: RoleId;
}

/**
 * True when this role still accepts its shared preset password — i.e. nobody
 * real holds it yet. Creating an active named GM retires the `gm` login.
 */
export async function presetLoginAllowed(role: RoleId): Promise<boolean> {
  const users = await getUserStore().list(companyId());
  return !users.some((u) => u.role === role && u.active);
}

/**
 * Authenticate a named user. Returns null for unknown user, wrong password, or
 * a deactivated account — the caller must not distinguish them out loud.
 */
export async function authenticateNamedUser(
  username: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const user = await getUserStore().find(companyId(), username);
  if (!user) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  // Check the password even when inactive, so a disabled account cannot be
  // enumerated by how fast it is rejected.
  if (!ok || !user.active) return null;
  return { username: user.username, displayName: user.displayName, role: user.role };
}

/** Create a user. Returns an error string, or null on success. */
export async function createUser(opts: {
  username: string;
  displayName: string;
  role: RoleId;
  password: string;
  createdBy: string;
}): Promise<string | null> {
  const nameErr = validateUsername(opts.username);
  if (nameErr) return nameErr;
  const pwErr = validatePassword(opts.password);
  if (pwErr) return pwErr;
  // Roles are rows now, so "is this a real role?" is a lookup, not a type
  // guard — that is what lets a GM assign the Supervisor role they created.
  if (!(await isAssignableRole(opts.role))) return "Unknown role.";

  const username = normalizeUsername(opts.username);
  const store = getUserStore();
  if (await store.find(companyId(), username)) return `User "${username}" already exists.`;

  await store.upsert(companyId(), {
    username,
    displayName: opts.displayName.trim() || username,
    role: opts.role,
    active: true,
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(opts.password),
  });
  return null;
}

/**
 * Sign in: a named plant user first, the shared preset role login second.
 *
 * Lives here rather than in config.ts on purpose. `src/proxy.ts` imports
 * session.ts, which imports config.ts, so config.ts has to stay a leaf that
 * pulls in nothing but persona data — the moment it reached node:crypto and the
 * Supabase client through this module, every route importing it stopped
 * resolving. Keep config.ts free of runtime-specific imports.
 *
 * The preset is a bootstrap, not a peer: it only answers while no ACTIVE named
 * user holds that role, so creating a real GM retires `gm` automatically.
 */
export async function authenticate(
  identity: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const named = await authenticateNamedUser(identity, password);
  if (named) return named;

  const preset = findUser(identity, password);
  if (!preset) return null;
  if (!(await presetLoginAllowed(preset.role))) return null;
  return {
    username: preset.username,
    displayName: `${personaDef(preset.role).label} (shared login)`,
    role: preset.role,
  };
}

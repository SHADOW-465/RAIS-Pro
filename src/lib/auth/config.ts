// Preset plant logins = the same three roles as the topbar persona switcher
// (GM, Owner, Operator). User picks a role on /login and enters that role's
// password. Auth is always on — no env flag required.
//
// The built-in secret and passwords below are PUBLIC — they are in the repo.
// Anyone with a checkout can mint a signed session for any role against a
// deployment still using them, which makes every capability check downstream
// decorative. They exist so a fresh clone (and a plant that just wants the
// simple pilot passwords) runs with zero setup; they are not real credentials.
//
// This file used to refuse to authenticate at all in production when they were
// left in place. That was the wrong shape: `getAuthSecret`/`passwordForRole`
// sit underneath src/proxy.ts, which runs on every request, so throwing here
// took the entire app down — on Vercel specifically, which sets
// NODE_ENV=production automatically and never sees .env.local (it's
// gitignored; Vercel env vars are configured separately, in its dashboard).
// A security check that can 500 every page is worse than the risk it guards
// against. Using a default now only logs a warning — see the two functions.

import {
  PERSONAS,
  PERSONA_ORDER,
  isPersonaId,
  type PersonaId,
} from "@/lib/persona";

export const SESSION_COOKIE = "moid_session";

/** Single-tenant by default; one deployment may host several plants.
 *
 *  Lives here, not in users.ts, purely to keep `roles.ts` and `users.ts` from
 *  importing each other — roles.ts needs the company and users.ts needs to
 *  validate a role against the roles store, which would otherwise be a cycle.
 *  A bare env read is safe in this leaf module. */
export const DEFAULT_COMPANY = "default";

export function companyId(): string {
  return process.env.MOID_COMPANY_ID || DEFAULT_COMPANY;
}

/** Session lifetime (seconds). Default 12h plant shift. */
export const SESSION_TTL_SEC = 60 * 60 * 12;

/**
 * Built-in session signing key when MOID_AUTH_SECRET is unset.
 * Must be ≥16 chars. Change/override for production plants that need
 * independent session invalidation across environments.
 */
export const DEFAULT_AUTH_SECRET =
  "moid-built-in-session-hmac-v1-not-for-high-security-plants";

/** Fixed login ids — identical to PersonaId / topbar roles. */
export const PRESET_LOGIN_IDS: readonly PersonaId[] = PERSONA_ORDER;

/**
 * Default pilot passwords (override in env for real plants).
 * Documented in .env.example — change before any real deployment.
 */
export const DEFAULT_PRESET_PASSWORDS: Record<PersonaId, string> = {
  gm: "moid-gm",
  owner: "moid-owner",
  operator: "moid-operator",
};

export type AuthUser = {
  /** Same as role id: gm | owner | operator */
  username: string;
  password: string;
  role: PersonaId;
};

/** Public list for the login picker (no secrets). */
export type LoginOption = {
  id: PersonaId;
  username: string;
  label: string;
  title: string;
  initial: string;
  homeHref: string;
};

/** Names of the env vars a production deployment SHOULD set — advisory only.
 *  Nothing in this file calls this and refuses to run: `getAuthSecret` and
 *  `passwordForRole` sit underneath `src/proxy.ts`, which runs on every single
 *  request. A version of this that threw here once took the whole app down on
 *  Vercel — Vercel sets NODE_ENV=production automatically, .env.local never
 *  reaches it (it's gitignored, and Vercel env vars are configured separately
 *  in its dashboard), and a plant that wants the simple pilot passwords is
 *  allowed to have them. Surface this instead where a human will actually see
 *  it — a settings banner, a startup log — never as a request-path throw. */
export function missingProductionSecrets(): string[] {
  const missing: string[] = [];
  if ((process.env.MOID_AUTH_SECRET ?? "").trim().length < 16) {
    missing.push("MOID_AUTH_SECRET");
  }
  const shared = (process.env.MOID_AUTH_PASSWORD ?? "").trim();
  for (const role of PRESET_LOGIN_IDS) {
    const own = (process.env[`MOID_AUTH_PASSWORD_${role.toUpperCase()}`] ?? "").trim();
    if (!own && !shared) missing.push(`MOID_AUTH_PASSWORD_${role.toUpperCase()}`);
  }
  return missing;
}

let warnedSecret = false;

/** Signing secret: env override, else the built-in default. Logs once, never
 *  throws — see the note on `missingProductionSecrets`. */
export function getAuthSecret(): string {
  const s = (process.env.MOID_AUTH_SECRET ?? "").trim();
  if (s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && !warnedSecret) {
    warnedSecret = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] MOID_AUTH_SECRET is not set — using the built-in default, which is " +
        "public in this repo. Set it in your host's environment variables to make " +
        "sessions unforgeable by anyone with a checkout.",
    );
  }
  return DEFAULT_AUTH_SECRET;
}

/** Length-independent, constant-time string compare. `!==` on a password
 *  short-circuits at the first differing byte and leaks its position. */
function secretEquals(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Compare a fixed number of bytes so the loop count reveals no length.
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length, 1);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

let warnedPassword = false;

/** Password for a preset role: env override, else default pilot password.
 *  Logs once, never throws — see the note on `missingProductionSecrets`. */
export function passwordForRole(role: PersonaId): string {
  const envKeys: Record<PersonaId, string[]> = {
    gm: ["MOID_AUTH_PASSWORD_GM", "MOID_AUTH_PASSWORD"],
    owner: ["MOID_AUTH_PASSWORD_OWNER", "MOID_AUTH_PASSWORD"],
    operator: ["MOID_AUTH_PASSWORD_OPERATOR", "MOID_AUTH_PASSWORD"],
  };
  for (const key of envKeys[role]) {
    const v = (process.env[key] ?? "").trim();
    if (v) return v;
  }
  if (process.env.NODE_ENV === "production" && !warnedPassword) {
    warnedPassword = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] Using the built-in pilot passwords (moid-gm / moid-owner / moid-operator) " +
        "— these are public in this repo. Set MOID_AUTH_PASSWORD_* in your host's " +
        "environment variables, or create named users under Settings → Plant users.",
    );
  }
  return DEFAULT_PRESET_PASSWORDS[role];
}

/** Always the three topbar roles when auth is configured. */
export function getAuthUsers(): AuthUser[] {
  return PRESET_LOGIN_IDS.map((role) => ({
    username: role,
    password: passwordForRole(role),
    role,
  }));
}

export function listLoginOptions(): LoginOption[] {
  return PRESET_LOGIN_IDS.map((id) => {
    const p = PERSONAS[id];
    return {
      id,
      username: id,
      label: p.label,
      title: p.title,
      initial: p.initial,
      homeHref: p.homeHref,
    };
  });
}

/** Sign-in is always required (preset GM / Owner / Operator). */
export function isAuthEnabled(): boolean {
  return true;
}

/**
 * Accept username or role id (gm / owner / operator) + password.
 * Username is case-insensitive for convenience.
 */
export function findUser(
  username: string,
  password: string,
): AuthUser | null {
  const u = username.trim().toLowerCase();
  // Allow full labels loosely? Stick to ids + common aliases.
  const aliases: Record<string, PersonaId> = {
    gm: "gm",
    "general manager": "gm",
    "general manager (gm)": "gm",
    owner: "owner",
    operator: "operator",
    "data entry operator": "operator",
    "data-entry": "operator",
  };
  const role: PersonaId | null = isPersonaId(u)
    ? u
    : aliases[u] ?? null;
  if (!role) return null;
  const user = getAuthUsers().find((x) => x.role === role);
  if (!user || !secretEquals(user.password, password)) return null;
  return user;
}

/** @deprecated kept for tests that built custom user lists — use presets. */
export function parseAuthUsers(raw: string | undefined | null): AuthUser[] {
  // Legacy MOID_AUTH_USERS: if set, still merge as extra passwords for roles
  // only when entries map to a known role (ignore free-form extra users).
  const s = (raw ?? "").trim();
  if (!s) return getAuthUsers();
  // Prefer preset model; legacy string ignored for login identity.
  return getAuthUsers();
}

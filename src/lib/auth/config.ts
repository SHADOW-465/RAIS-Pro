// Preset plant logins = the same three roles as the topbar persona switcher
// (GM, Owner, Operator). User picks a role on /login and enters that role's
// password. Auth is always on.
//
// There are NO credentials in this repo. In production the app refuses to run
// without MOID_AUTH_SECRET (the proxy answers 503 with the reason, see
// authConfigError) and a preset role can only sign in once its password is set
// in the environment. Outside production a dev-only signing key is used, with a
// warning, so `npm run dev` and tests need no setup for the session secret.

import { authSecretProblem } from "@/lib/env";
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
 * Signing key used ONLY outside production (dev, tests), with a warning.
 * Production never uses it: getAuthSecret throws instead.
 */
const DEV_ONLY_AUTH_SECRET = "moid-dev-only-session-hmac-never-used-in-production";

/** Fixed login ids — identical to PersonaId / topbar roles. */
export const PRESET_LOGIN_IDS: readonly PersonaId[] = PERSONA_ORDER;

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

/** Set in production, this is why the app must not serve requests (else null).
 *  The proxy turns it into a 503 before anything else runs. */
export function authConfigError(): string | null {
  return authSecretProblem();
}

/** Names of preset-login env vars that are unset (advisory: named users created
 *  under Settings → Plant users do not need them). */
export function missingProductionSecrets(): string[] {
  const missing: string[] = [];
  if ((process.env.MOID_AUTH_SECRET ?? "").trim().length < 16) {
    missing.push("MOID_AUTH_SECRET");
  }
  for (const role of PRESET_LOGIN_IDS) {
    if (!passwordForRole(role, false)) {
      missing.push(`MOID_AUTH_PASSWORD_${role.toUpperCase()}`);
    }
  }
  return missing;
}

let warnedSecret = false;

/** Signing secret. Production without MOID_AUTH_SECRET throws (fail closed);
 *  elsewhere a dev-only key is used and a warning is logged once. */
export function getAuthSecret(): string {
  const s = (process.env.MOID_AUTH_SECRET ?? "").trim();
  if (s.length >= 16) return s;
  const problem = authSecretProblem();
  if (problem) throw new Error(`[auth] ${problem}`);
  if (!warnedSecret) {
    warnedSecret = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] MOID_AUTH_SECRET is not set — using a dev-only signing key. " +
        "Fine for local development; production refuses to start without it.",
    );
  }
  return DEV_ONLY_AUTH_SECRET;
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

const warnedPassword = new Set<PersonaId>();

/** Password for a preset role from the environment, or null when none is set —
 *  that preset login is then disabled (there is no built-in default). */
export function passwordForRole(role: PersonaId, warn = true): string | null {
  const envKeys: Record<PersonaId, string[]> = {
    gm: ["MOID_AUTH_PASSWORD_GM", "MOID_AUTH_PASSWORD"],
    owner: ["MOID_AUTH_PASSWORD_OWNER", "MOID_AUTH_PASSWORD"],
    operator: ["MOID_AUTH_PASSWORD_OPERATOR", "MOID_AUTH_PASSWORD"],
  };
  for (const key of envKeys[role]) {
    const v = (process.env[key] ?? "").trim();
    if (v) return v;
  }
  if (warn && !warnedPassword.has(role)) {
    warnedPassword.add(role);
    // eslint-disable-next-line no-console
    console.warn(
      `[auth] No password configured for the "${role}" preset login ` +
        `(MOID_AUTH_PASSWORD_${role.toUpperCase()}); it is disabled. Set it in the ` +
        "environment, or sign in as a named user (Settings → Plant users).",
    );
  }
  return null;
}

/** Always the three topbar roles when auth is configured. */
export function getAuthUsers(): AuthUser[] {
  const users: AuthUser[] = [];
  for (const role of PRESET_LOGIN_IDS) {
    const password = passwordForRole(role);
    if (password) users.push({ username: role, password, role });
  }
  return users;
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

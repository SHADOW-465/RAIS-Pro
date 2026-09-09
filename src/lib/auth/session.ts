// HMAC-signed session tokens. Works in Node (API routes) and Edge (proxy)
// via Web Crypto — no extra packages, fine for Vercel and the plant image.

import {
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  getAuthSecret,
} from "./config";
import type { RoleId } from "@/lib/persona";

export type SessionPayload = {
  /** username */
  u: string;
  /**
   * Role id. Deliberately NOT validated against a known set here: roles live in
   * `plant_roles` now, and this module runs in the Edge proxy where reaching the
   * database is not an option. The token is signed, so `r` is untampered; what
   * it MEANS is resolved at the API boundary by lib/auth/roles.ts, which denies
   * an id it cannot find. Rejecting unknown ids here would have made every
   * plant-created role unable to sign in.
   */
  r: RoleId;
  /** exp unix seconds */
  exp: number;
};

function b64urlEncode(data: ArrayBuffer | Uint8Array | string): string {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(bin)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToString(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  if (typeof atob !== "undefined") {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, "base64").toString("utf8");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(body: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return b64urlEncode(sig);
}

export async function createSessionToken(
  user: { username: string; role: RoleId },
  ttlSec: number = SESSION_TTL_SEC,
): Promise<string> {
  const secret = getAuthSecret();
  const payload: SessionPayload = {
    u: user.username,
    r: user.role,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await sign(body, secret);
  return `${body}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null;
  const secret = getAuthSecret();
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await sign(body, secret);
  if (expected.length !== sig.length) return null;
  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;
  try {
    const raw = JSON.parse(b64urlDecodeToString(body)) as SessionPayload;
    if (!raw?.u || typeof raw.r !== "string" || !raw.r || typeof raw.exp !== "number") return null;
    if (raw.exp < Math.floor(Date.now() / 1000)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSec: number = SESSION_TTL_SEC) {
  // Plant LAN is often plain HTTP — Secure cookies would never stick.
  // Enable Secure on Vercel (HTTPS) or when explicitly requested.
  const secure =
    process.env.MOID_AUTH_COOKIE_SECURE === "1" ||
    process.env.VERCEL === "1" ||
    process.env.MOID_AUTH_COOKIE_SECURE === "true";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSec,
  };
}

export { SESSION_COOKIE };

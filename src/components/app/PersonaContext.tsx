"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PERSONA,
  personaDef,
  readStoredPersona,
  writeStoredPersona,
  type NavKey,
  type PersonaCapabilities,
  type PersonaDef,
  type RoleId,
} from "@/lib/persona";

type AuthUser = { username: string; role: RoleId } | null;

/** What /api/auth/me sends back about the signed-in role. */
type ServerRole = {
  roleId: RoleId;
  label: string;
  title: string;
  initial: string;
  homeHref: string;
  navAllow: NavKey[];
  capabilities: PersonaCapabilities;
  grants: string[];
};

type PersonaCtx = {
  persona: RoleId;
  setPersona: (id: RoleId) => void;
  /**
   * The signed-in role's definition — the server's copy when there is a
   * session, the built-in one otherwise.
   *
   * Chrome reads THIS rather than indexing `PERSONAS`, because a role the
   * plant created is in neither the union nor this bundle. Looking it up there
   * used to miss and fall back to the default persona, which is a full-access
   * GM: a supervisor was shown every screen including Settings.
   */
  def: PersonaDef;
  /** Convenience: may this role open that sidebar destination? */
  allowsNav: (key: NavKey) => boolean;
  /**
   * May this role see a given grant leaf — a dashboard card, today.
   *
   * Null when the signed-in role's grants are not known yet (before
   * /api/auth/me answers, or for the built-in fallback). Callers must read
   * null as "show everything": withholding a card because the answer has not
   * arrived would make the board flicker on every load.
   */
  grants: ReadonlySet<string> | null;
  capabilities: PersonaCapabilities;
  canWrite: boolean;
  canApprove: boolean;
  canConfigure: boolean;
  /** GM only — may permanently erase rows already in the ledger. */
  canEraseLedger: boolean;
  /** Always true — sign-in is required (hardcoded presets). */
  authEnabled: boolean;
  /** Signed-in user when auth is on; null when open or signed out. */
  authUser: AuthUser;
  /** When auth is on, persona is bound to the session role. */
  personaLocked: boolean;
  /** True until the first /api/auth/me round-trip finishes. */
  authReady: boolean;
  /** Re-read session (call after login so events/registry can load). */
  refreshAuth: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<PersonaCtx | null>(null);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersonaState] = useState<RoleId>(DEFAULT_PERSONA);
  const [serverRole, setServerRole] = useState<ServerRole | null>(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser>(null);
  const [authReady, setAuthReady] = useState(false);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (data.authEnabled) {
        setAuthEnabled(true);
        // Any role id, not just the three built-in ones. Gating this on a
        // closed union is what made a plant-created role fall through to the
        // default GM persona and see the whole sidebar.
        if (data.user?.username && typeof data.user.role === "string" && data.user.role) {
          setAuthUser({ username: data.user.username, role: data.user.role });
          setPersonaState(data.user.role);
          setServerRole(data.role ?? null);
          writeStoredPersona(data.user.role);
        } else {
          setAuthUser(null);
          setServerRole(null);
        }
      } else {
        setAuthEnabled(false);
        setAuthUser(null);
        setServerRole(null);
        setPersonaState(readStoredPersona());
      }
    } catch {
      setPersonaState(readStoredPersona());
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const setPersona = useCallback(
    (id: RoleId) => {
      // Role comes from the session when auth is enabled — chrome switcher is locked.
      if (authEnabled) return;
      setPersonaState(id);
      writeStoredPersona(id);
    },
    [authEnabled],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } finally {
      setAuthUser(null);
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  }, []);

  const value = useMemo<PersonaCtx>(() => {
    // Server first; the built-in definition is the fallback for the signed-out
    // moment before /api/auth/me answers, and for tests.
    const def: PersonaDef =
      serverRole && serverRole.roleId === persona
        ? { ...personaDef(persona), ...serverRole, id: serverRole.roleId as PersonaDef["id"] }
        : personaDef(persona);
    const capabilities = def.capabilities;
    return {
      persona,
      setPersona,
      def,
      allowsNav: (key: NavKey) => def.navAllow.includes(key),
      grants:
        serverRole && serverRole.roleId === persona ? new Set(serverRole.grants ?? []) : null,
      capabilities,
      canWrite: capabilities.write,
      canApprove: capabilities.approve,
      canConfigure: capabilities.configure,
      canEraseLedger: capabilities.eraseLedger,
      authEnabled,
      authUser,
      personaLocked: authEnabled,
      authReady,
      refreshAuth,
      signOut,
    };
  }, [persona, serverRole, setPersona, authEnabled, authUser, authReady, refreshAuth, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePersona(): PersonaCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Safe fallback when a page is rendered outside the provider (tests).
    const def = personaDef(DEFAULT_PERSONA);
    const capabilities = def.capabilities;
    return {
      persona: DEFAULT_PERSONA,
      setPersona: () => {},
      def,
      allowsNav: (key: NavKey) => def.navAllow.includes(key),
      grants: null,
      capabilities,
      canWrite: capabilities.write,
      canApprove: capabilities.approve,
      canConfigure: capabilities.configure,
      canEraseLedger: capabilities.eraseLedger,
      authEnabled: false,
      authUser: null,
      personaLocked: false,
      authReady: true,
      refreshAuth: async () => {},
      signOut: async () => {},
    };
  }
  return v;
}

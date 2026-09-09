"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PERSONA,
  personaDef,
  isPersonaId,
  readStoredPersona,
  writeStoredPersona,
  type PersonaCapabilities,
  type PersonaId,
} from "@/lib/persona";

type AuthUser = { username: string; role: PersonaId } | null;

type PersonaCtx = {
  persona: PersonaId;
  setPersona: (id: PersonaId) => void;
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
  const [persona, setPersonaState] = useState<PersonaId>(DEFAULT_PERSONA);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser>(null);
  const [authReady, setAuthReady] = useState(false);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (data.authEnabled) {
        setAuthEnabled(true);
        if (data.user?.username && isPersonaId(data.user.role)) {
          setAuthUser({ username: data.user.username, role: data.user.role });
          setPersonaState(data.user.role);
          writeStoredPersona(data.user.role);
        } else {
          setAuthUser(null);
        }
      } else {
        setAuthEnabled(false);
        setAuthUser(null);
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
    (id: PersonaId) => {
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
    const capabilities = personaDef(persona).capabilities;
    return {
      persona,
      setPersona,
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
  }, [persona, setPersona, authEnabled, authUser, authReady, refreshAuth, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePersona(): PersonaCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Safe fallback when a page is rendered outside the provider (tests).
    const capabilities = personaDef(DEFAULT_PERSONA).capabilities;
    return {
      persona: DEFAULT_PERSONA,
      setPersona: () => {},
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

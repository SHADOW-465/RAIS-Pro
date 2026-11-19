"use client";

import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BRAND_NAME } from "@/lib/brand";
import { homeAfterAccessGranted } from "@/lib/auth/clerk-session-ui";
import { usePersona } from "@/components/app/PersonaContext";
import "../login/login.css";

export function NoAccessView({ clerk }: { clerk: boolean }) {
  const router = useRouter();
  const { authUser, authReady, def, refreshAuth } = usePersona();
  const [checking, setChecking] = useState(true);

  const goHomeIfMapped = useCallback(() => {
    if (!authUser) return false;
    router.replace(homeAfterAccessGranted(def.homeHref));
    return true;
  }, [authUser, def.homeHref, router]);

  const checkAccess = useCallback(
    async (retryOn401: boolean) => {
      setChecking(true);
      try {
        await refreshAuth({ retryOn401 });
      } finally {
        setChecking(false);
      }
    },
    [refreshAuth],
  );

  useEffect(() => {
    void checkAccess(true);
  }, [checkAccess]);

  useEffect(() => {
    if (authReady) goHomeIfMapped();
  }, [authReady, goHomeIfMapped]);

  return (
    <div className="login-page login-page--open login-page--clerk">
      <main className="login-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="login-panel-inner">
          <header className="login-panel-head">
            <p className="login-mark-name" style={{ marginBottom: 8 }}>
              {BRAND_NAME}
            </p>
            <h1 className="login-panel-title">
              {checking && !authUser ? "Checking access…" : "No access yet"}
            </h1>
            <p className="login-panel-sub">
              {checking && !authUser
                ? "Looking up this account's MOID role."
                : "You are signed in, but this account is not linked to a MOID role. Ask a plant manager to grant access, then check again — you should not have to sign in a second time."}
            </p>
          </header>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              type="button"
              className="login-submit"
              onClick={() => void checkAccess(true)}
              disabled={checking}
            >
              {checking ? "Checking…" : "Check again"}
            </button>
            {clerk ? (
              <SignOutButton redirectUrl="/login">
                <button type="button" className="login-submit" style={{ background: "transparent", color: "inherit", border: "1px solid var(--border-strong, #e2e8f0)" }}>
                  Sign out
                </button>
              </SignOutButton>
            ) : (
              <Link href="/login" className="login-submit" style={{ textAlign: "center" }}>
                Back to sign in
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import "../login/login.css";

export function NoAccessView({ clerk }: { clerk: boolean }) {
  return (
    <div className="login-page login-page--open login-page--clerk">
      <main className="login-panel" style={{ gridColumn: "1 / -1" }}>
        <div className="login-panel-inner">
          <header className="login-panel-head">
            <p className="login-mark-name" style={{ marginBottom: 8 }}>
              {BRAND_NAME}
            </p>
            <h1 className="login-panel-title">No access yet</h1>
            <p className="login-panel-sub">
              You are signed in, but this account is not linked to a MOID role.
              Ask a plant manager to grant access, then sign in again.
            </p>
          </header>
          {clerk ? (
            <SignOutButton redirectUrl="/login">
              <button type="button" className="login-submit">
                Sign out
              </button>
            </SignOutButton>
          ) : (
            <Link href="/login" className="login-submit" style={{ textAlign: "center" }}>
              Back to sign in
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

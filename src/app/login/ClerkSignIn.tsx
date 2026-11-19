"use client";

import { SignIn } from "@clerk/nextjs";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import "./login.css";

const ACCENT = "#2563EB";

function safeNext(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return undefined;
  return raw;
}

export function ClerkSignIn({ nextPath }: { nextPath?: string }) {
  const dest = safeNext(nextPath) ?? "/";
  return (
    <div className="login-page login-page--clerk">
      <aside className="login-rail" aria-label="About this product">
        <div className="login-rail-brand">
          <div className="login-mark">
            <span className="login-mark-glyph" aria-hidden>
              M
            </span>
            <span>
              <span className="login-mark-name">{BRAND_NAME}</span>
              <span className="login-mark-tag">{BRAND_TAGLINE}</span>
            </span>
          </div>
          <h1 className="login-rail-title">Plant quality, on the ledger.</h1>
          <p className="login-rail-lede">
            Sign in with Google or an email code. Numbers stay deterministic; the
            model never invents a KPI.
          </p>
          <ul className="login-rail-points">
            <li>Every entry is attributed to the person who made it</li>
            <li>Your role decides which screens and actions you get</li>
            <li>Only invited accounts can sign in</li>
          </ul>
        </div>
        <p className="login-rail-foot">
          <strong>Access:</strong> a plant manager has to link your account to a
          MOID role before any screen opens.
        </p>
      </aside>

      <main className="login-panel">
        <div className="login-panel-inner">
          <header className="login-panel-head">
            <h2 className="login-panel-title">Sign in</h2>
            <p className="login-panel-sub">Continue with Google, or use an email code.</p>
          </header>
          <div className="login-clerk">
            <SignIn
              routing="path"
              path="/login"
              signUpUrl="/login"
              fallbackRedirectUrl={dest}
              appearance={{
                variables: {
                  colorPrimary: ACCENT,
                  colorPrimaryForeground: "#ffffff",
                  colorBackground: "#ffffff",
                  colorForeground: "#0f172a",
                  colorMutedForeground: "#475569",
                  colorNeutral: "#64748b",
                  colorDanger: "#dc2626",
                  borderRadius: "8px",
                },
                elements: {
                  card: "login-clerk-card",
                  headerTitle: { display: "none" },
                  headerSubtitle: { display: "none" },
                  socialButtonsBlockButton: {
                    borderColor: "var(--border-strong, #e2e8f0)",
                  },
                  formButtonPrimary: {
                    backgroundColor: ACCENT,
                    fontWeight: 600,
                  },
                },
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

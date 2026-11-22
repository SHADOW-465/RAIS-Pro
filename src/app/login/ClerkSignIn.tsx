"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SignIn, SignUp } from "@clerk/nextjs";
import { isClerkSignUpTicket, type ClerkLoginMode } from "@/lib/auth/clerk-login-mode";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import "./login.css";

const ACCENT = "#2563EB";

const INVITE_FLOW_KEY = "moid:clerk-invite-signup";

const appearance = {
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
};

function safeNext(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return undefined;
  return raw;
}

export function ClerkSignIn({
  nextPath,
  mode = "sign-in",
  usernameLogin = false,
}: {
  nextPath?: string;
  mode?: ClerkLoginMode;
  /** Show the low-key break-glass username/password toggle (server-gated). */
  usernameLogin?: boolean;
}) {
  const dest = safeNext(nextPath) ?? "/";
  const [signUp, setSignUp] = useState(mode === "sign-up");

  // After Clerk consumes the ticket it may navigate to /login/sso-callback
  // (same catch-all, query string gone). Remember that this tab is finishing
  // an invite so we keep <SignUp> mounted. A later visit to bare /login clears it.
  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const fromUrl = isClerkSignUpTicket({
        __clerk_ticket: qs.get("__clerk_ticket") ?? undefined,
        __clerk_status: qs.get("__clerk_status") ?? undefined,
      });
      const path = window.location.pathname;
      const atRoot = path === "/login" || path === "/login/";
      if (fromUrl || mode === "sign-up") {
        sessionStorage.setItem(INVITE_FLOW_KEY, "1");
        setSignUp(true);
        return;
      }
      if (atRoot) {
        sessionStorage.removeItem(INVITE_FLOW_KEY);
        setSignUp(false);
        return;
      }
      if (sessionStorage.getItem(INVITE_FLOW_KEY) === "1") setSignUp(true);
    } catch {
      // sessionStorage may be blocked; the server-passed mode still applies.
    }
  }, [mode]);

  const Form = signUp ? SignUp : SignIn;

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
            {signUp
              ? "Accept your invite with Google or an email code. Numbers stay deterministic; the model never invents a KPI."
              : "Sign in with Google or an email code. Numbers stay deterministic; the model never invents a KPI."}
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
            <h2 className="login-panel-title">{signUp ? "Accept invitation" : "Sign in"}</h2>
            <p className="login-panel-sub">
              {signUp
                ? "Finish with Google, or use an email code."
                : "Continue with Google, or use an email code."}
            </p>
          </header>
          <div className="login-clerk">
            <Form
              routing="path"
              path="/login"
              {...(signUp ? { signInUrl: "/login" } : { signUpUrl: "/login" })}
              fallbackRedirectUrl={dest}
              appearance={appearance}
            />
          </div>
          {usernameLogin && !signUp ? <UsernamePasswordLogin nextPath={nextPath} /> : null}
        </div>
      </main>
    </div>
  );
}

function UsernamePasswordLogin({ nextPath }: { nextPath?: string }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        user?: { homeHref?: string };
      };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Wrong username or password.");
        return;
      }
      const dest = safeNext(nextPath) ?? data.user?.homeHref ?? "/";
      window.location.assign(dest);
    } catch {
      setError("Sign-in is temporarily unavailable. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-alt login-username">
      {!open ? (
        <button
          type="button"
          className="login-username-toggle"
          onClick={() => setOpen(true)}
        >
          Sign in with username
        </button>
      ) : (
        <form onSubmit={onSubmit} className="login-username-form">
          <p className="login-alt-title">Sign in with username</p>
          <div className="login-field">
            <label className="login-field-label" htmlFor="break-glass-username">
              Username
            </label>
            <input
              id="break-glass-username"
              className="login-input"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(ev) => setUsername(ev.target.value)}
              disabled={pending}
            />
          </div>
          <div className="login-field">
            <label className="login-field-label" htmlFor="break-glass-password">
              Password
            </label>
            <input
              id="break-glass-password"
              className="login-input"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              disabled={pending}
            />
          </div>
          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="login-submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
          <button
            type="button"
            className="login-username-toggle"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            disabled={pending}
          >
            Use Google or email instead
          </button>
        </form>
      )}
    </div>
  );
}

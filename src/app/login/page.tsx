"use client";

// Sign in.
//
// This page used to offer exactly three tiles — GM, Owner, Operator — and a
// password box. That was the whole login surface, so a plant that created a
// Supervisor role and gave R. Kumar an account had no way to let him in: the
// API had accepted a username all along, nothing on screen asked for one.
//
// The shape now matches what `lib/auth/users.ts#authenticate` actually does. It
// tries a named user first and falls back to a preset role login, which means
// ONE identity field covers both — a username, or a role id for the shared
// logins that are still live. The three tiles stay as shortcuts that fill that
// field in, because on a fresh deploy with no accounts yet they are the only
// way in and a new GM should not have to guess that "gm" is a valid username.
//
// They are labelled as what they are, rather than hidden once they retire. A
// shared login stops working the moment somebody real holds that role, and the
// page cannot ask which roles those are without telling an anonymous visitor
// how far the plant has got through creating accounts. Saying it in words
// costs nothing and leaks nothing.

import { useEffect, useRef, useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { PERSONAS, PERSONA_ORDER } from "@/lib/persona";
import { usePersona } from "@/components/app/PersonaContext";
import "./login.css";

type LoginOption = {
  id: string;
  username: string;
  label: string;
  title: string;
  initial: string;
};

const PRESET_FALLBACK: LoginOption[] = PERSONA_ORDER.map((id) => ({
  id,
  username: id,
  label: PERSONAS[id].label,
  title: PERSONAS[id].title,
  initial: PERSONAS[id].initial,
}));

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const nextParam = search.get("next");
  const { refreshAuth } = usePersona();

  const [presets, setPresets] = useState<LoginOption[]>(PRESET_FALLBACK);
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/logins", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (Array.isArray(data.logins) && data.logins.length > 0) setPresets(data.logins);
      } catch {
        /* keep the built-in list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** A tile fills the identity in and moves to the password — it is a shortcut
   *  for typing "gm", not a different kind of sign-in. */
  function fillSharedLogin(option: LoginOption) {
    setIdentity(option.username);
    setError(null);
    passwordRef.current?.focus();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `username` is the identity field for both kinds: the route hands it to
        // authenticate(), which tries a named account first and a preset role
        // second. Sending `role` instead would skip named users entirely.
        body: JSON.stringify({ username: identity.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed.");
        return;
      }
      // Land where this role says it lands — a supervisor opens the form they
      // are about to fill, a GM opens the plant's state — unless the proxy
      // already knew where they were headed.
      const home = data.user?.homeHref as string | undefined;
      const dest =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : home && home.startsWith("/")
            ? home
            : "/";
      // Pull session into PersonaContext so Events/Registry re-fetch without a full reload.
      await refreshAuth();
      router.replace(dest);
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
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
            Sign in with your own account. Numbers stay deterministic; the model never
            invents a KPI.
          </p>
          <ul className="login-rail-points">
            <li>Every entry is attributed to the person who made it</li>
            <li>Your role decides which screens and actions you get</li>
            <li>Works on plant LAN and on hosted pilots</li>
          </ul>
        </div>
        <p className="login-rail-foot">
          <strong>Session:</strong> about 12 hours. Sign out from the account menu when
          you are done on a shared terminal.
        </p>
      </aside>

      <main className="login-panel">
        <form className="login-panel-inner" onSubmit={onSubmit} noValidate>
          <header className="login-panel-head">
            <h2 className="login-panel-title">Sign in</h2>
            <p className="login-panel-sub">
              Use the username your plant manager gave you.
            </p>
          </header>

          <div className="login-field">
            <label className="login-field-label" htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              className="login-input"
              type="text"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              required
              placeholder="r.kumar"
              disabled={busy}
              // A shop-floor terminal opens this page all day; put the cursor
              // where the first keystroke belongs.
              autoFocus
            />
          </div>

          <div className="login-field">
            <label className="login-field-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              ref={passwordRef}
              className="login-input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter password"
              disabled={busy}
            />
          </div>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="login-submit"
            disabled={busy || !identity.trim() || !password}
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <section className="login-alt" aria-labelledby="login-alt-title">
            <h3 className="login-alt-title" id="login-alt-title">
              Shared role logins
            </h3>
            <div className="login-chips">
              {presets.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="login-chip"
                  onClick={() => fillSharedLogin(option)}
                  disabled={busy}
                >
                  <span className="login-chip-initial" aria-hidden>
                    {option.initial}
                  </span>
                  <span className="login-chip-label">{option.label}</span>
                </button>
              ))}
            </div>
            <p className="login-alt-note">
              For a plant that has not created accounts yet. Each one stops working as
              soon as somebody has a personal account for that role — which is the point:
              the ledger can then name who entered a value, instead of recording a job
              title a whole shift shares.
            </p>
          </section>
        </form>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-page login-page--open">
          <div className="login-panel">
            <div className="login-panel-inner">
              <p className="login-panel-sub">Loading…</p>
            </div>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

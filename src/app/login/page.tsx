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
// Above that sits the quick login a shop floor actually uses: a card per
// person, grouped under the role they hold, so the page shows every role that
// has accounts. Tapping a card fills the username in — it is a shortcut for
// typing, not a way past the password.
//
// That list is public, because this page has no session to check. See the note
// on /api/auth/logins for what that discloses and why it was chosen over
// giving every role a shared password: a shared login costs the ledger the
// thing it exists for, which is being able to name who entered a value.
//
// Retired shared logins are filtered out server-side rather than shown and
// left to fail. Once the staff list is public, hiding them leaks nothing new —
// a role with a named account is already visible above.

import { useEffect, useMemo, useRef, useState, FormEvent, Suspense } from "react";
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

type LoginPerson = {
  username: string;
  displayName: string;
  roleId: string;
  roleLabel: string;
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
  const [people, setPeople] = useState<LoginPerson[]>([]);
  const [roleOrder, setRoleOrder] = useState<string[]>([]);
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
        // An empty preset list is meaningful — every shared login has retired —
        // so only fall back to the built-in list when the field is absent.
        if (Array.isArray(data.logins)) setPresets(data.logins);
        if (Array.isArray(data.people)) setPeople(data.people);
        if (Array.isArray(data.roleOrder)) setRoleOrder(data.roleOrder);
      } catch {
        /* keep the built-in list */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** A card fills the identity in and moves to the password — a shortcut for
   *  typing it, never a way past the password. */
  function pick(username: string) {
    setIdentity(username);
    setError(null);
    passwordRef.current?.focus();
  }

  /** People grouped under the role they hold, in the plant's own role order so
   *  the sign-in page reads like the org rather than like the database. */
  const groups = useMemo(() => {
    const byRole = new Map<string, { label: string; people: LoginPerson[] }>();
    for (const person of people) {
      const g = byRole.get(person.roleId) ?? { label: person.roleLabel, people: [] };
      g.people.push(person);
      byRole.set(person.roleId, g);
    }
    const rank = (id: string) => {
      const i = roleOrder.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...byRole.entries()]
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([roleId, g]) => ({ roleId, ...g }));
  }, [people, roleOrder]);

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

          {groups.length > 0 && (
            <section className="login-alt" aria-labelledby="login-people-title">
              <h3 className="login-alt-title" id="login-people-title">
                Or tap your name
              </h3>
              {groups.map((group) => (
                <div className="login-group" key={group.roleId}>
                  <h4 className="login-group-title">{group.label}</h4>
                  <div className="login-chips">
                    {group.people.map((person) => (
                      <button
                        key={person.username}
                        type="button"
                        className="login-chip"
                        onClick={() => pick(person.username)}
                        disabled={busy}
                      >
                        <span className="login-chip-initial" aria-hidden>
                          {person.initial}
                        </span>
                        <span className="login-chip-label">{person.displayName}</span>
                        <span className="login-chip-sub">{person.username}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {presets.length > 0 && (
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
                    onClick={() => pick(option.username)}
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
                {groups.length > 0
                  ? "Still live because nobody holds these roles by name yet. Each one retires the moment somebody does — that is how the ledger stops recording a job title a whole shift shares."
                  : "For a plant that has not created accounts yet. Each one stops working as soon as somebody has a personal account for that role, so the ledger can name who entered a value."}
              </p>
            </section>
          )}

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

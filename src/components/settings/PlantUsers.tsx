"use client";

// Plant users — named accounts instead of three shared role passwords.
//
// The reason this screen exists is attribution, not password strength: while a
// shift shares one "operator" login, every entry in an append-only audit ledger
// is authored by the word "operator". A GM creates a person here and the ledger
// can finally name who typed a value — and a leaver can be revoked without
// re-issuing a credential to everyone who stayed.
//
// Shared logins retire themselves: the banner disappears for a role once
// somebody real holds it.

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/editorial/Icon";
import Select from "@/components/ui/Select";
import { PERSONAS, PERSONA_ORDER, type PersonaId, personaDef } from "@/lib/persona";

interface PlantUser {
  username: string;
  displayName: string;
  role: PersonaId;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

const ROLE_OPTIONS = PERSONA_ORDER.map((id) => ({ value: id, label: PERSONAS[id].label }));

export default function PlantUsers() {
  const [users, setUsers] = useState<PlantUser[]>([]);
  const [sharedActive, setSharedActive] = useState<PersonaId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<PersonaId>("operator");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { credentials: "same-origin", cache: "no-store" });
      if (res.status === 403) {
        setError("Only a GM may manage plant users.");
        return;
      }
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed to load users.");
      const data = await res.json();
      setUsers(data.users ?? []);
      setSharedActive(data.sharedLoginsActive ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(body: unknown, method: "POST" | "PATCH") {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Request failed.");
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const ok = await send({ username, displayName, role, password }, "POST");
    if (ok) {
      setNotice(
        `Created ${username}. Give them this password directly — it is stored hashed and cannot be shown again.`,
      );
      setUsername("");
      setDisplayName("");
      setPassword("");
    }
  }

  async function onToggle(u: PlantUser) {
    await send({ username: u.username, action: u.active ? "deactivate" : "activate" }, "PATCH");
  }

  async function onResetPassword(u: PlantUser) {
    const next = window.prompt(`New password for ${u.displayName} (${u.username}):`);
    if (!next) return;
    const ok = await send({ username: u.username, action: "set-password", password: next }, "PATCH");
    if (ok) setNotice(`Password updated for ${u.username}.`);
  }

  if (error && users.length === 0 && !loading) {
    return <p className="settings-admin-warn">{error}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {sharedActive.length > 0 && (
        <p className="settings-admin-warn">
          <Icon name="alert" />{" "}
          {sharedActive.map((r) => personaDef(r).label).join(", ")}{" "}
          {sharedActive.length === 1 ? "still signs in" : "still sign in"} with a shared password, so
          entries record the role rather than the person. Creating an account for that role turns the
          shared login off automatically.
        </p>
      )}

      {notice && <p className="settings-admin-body" style={{ color: "var(--accent)" }}>{notice}</p>}
      {error && users.length > 0 && <p className="settings-admin-warn">{error}</p>}

      <section>
        <h3 className="settings-admin-title">Add a person</h3>
        <form
          onSubmit={onCreate}
          style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span className="small">Full name</span>
            <input
              className="settings-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="R. Kumar"
              required
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="small">Username</span>
            <input
              className="settings-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="r.kumar"
              required
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="small">Role</span>
            <Select value={role} onChange={(v) => setRole(v as PersonaId)} options={ROLE_OPTIONS} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="small">Initial password</span>
            <input
              className="settings-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="at least 8 characters"
              required
            />
          </label>
          <button type="submit" className="settings-btn settings-btn--primary" disabled={busy}>
            {busy ? "Saving…" : "Create user"}
          </button>
        </form>
      </section>

      <section>
        <h3 className="settings-admin-title">People ({users.length})</h3>
        {loading ? (
          <p className="settings-admin-body">Loading…</p>
        ) : users.length === 0 ? (
          <p className="settings-admin-body">
            No named accounts yet. Everyone shares a role password, so the audit trail cannot say who
            entered a value.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-3)" }}>
                  <th style={{ padding: "6px 8px" }}>Name</th>
                  <th style={{ padding: "6px 8px" }}>Username</th>
                  <th style={{ padding: "6px 8px" }}>Role</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  <th style={{ padding: "6px 8px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.username} style={{ borderTop: "1px solid var(--border)", opacity: u.active ? 1 : 0.55 }}>
                    <td style={{ padding: "8px" }}>{u.displayName}</td>
                    <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>{u.username}</td>
                    <td style={{ padding: "8px" }}>{personaDef(u.role).label}</td>
                    <td style={{ padding: "8px" }}>{u.active ? "Active" : "Disabled"}</td>
                    <td style={{ padding: "8px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="settings-btn settings-btn--ghost" onClick={() => onResetPassword(u)} disabled={busy}>
                        Reset password
                      </button>{" "}
                      <button className="settings-btn settings-btn--ghost" onClick={() => onToggle(u)} disabled={busy}>
                        {u.active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="settings-admin-body" style={{ marginTop: 10 }}>
          Disabling keeps every entry the person ever made — the ledger is append-only. It only stops
          them signing in.
        </p>
      </section>
    </div>
  );
}

"use client";

// Clerk Access — who may sign in with Google or an email code, and as what.
// Visible only to the built-in admin role (manageAccess). A GM does not see it.

import { useCallback, useEffect, useState } from "react";
import Select from "@/components/ui/Select";

type AccessUser = {
  id: string;
  email: string | null;
  username: string | null;
  role: string | null;
  roleLabel: string | null;
  status: "mapped" | "unmapped" | "banned";
  lastSignInAt: string | null;
  banned: boolean;
};

type Invitation = {
  id: string;
  email: string;
  username: string | null;
  role: string | null;
  status: string;
  createdAt: string | null;
};

type RoleOption = { roleId: string; label: string };

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function ClerkAccess() {
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("operator");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, invRes] = await Promise.all([
        fetch("/api/access/users", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/access/invitations", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (usersRes.status === 403) {
        setError("Only an admin may manage sign-in access.");
        return;
      }
      if (!usersRes.ok) throw new Error((await usersRes.json())?.error ?? "Failed to load users.");
      const usersData = await usersRes.json();
      setUsers(usersData.users ?? []);
      setRoles(usersData.roles ?? []);
      if (invRes.ok) {
        const invData = await invRes.json();
        setInvitations(invData.invitations ?? []);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load access.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onInvite = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/access/invitations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Invite failed.");
      setEmail("");
      setUsername("");
      setNotice(`Invitation sent to ${data.invitation?.email ?? email}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed.");
    } finally {
      setBusy(false);
    }
  };

  const onChangeRole = async (user: AccessUser, nextRole: string) => {
    if (!nextRole || nextRole === user.role) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/access/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole, username: user.username ?? undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not change role.");
      setNotice(`Updated ${user.email ?? user.username ?? "user"} to ${nextRole}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change role.");
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (user: AccessUser) => {
    if (!window.confirm(`Revoke access for ${user.email ?? user.username ?? user.id}? They will be signed out.`)) {
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/access/users/${encodeURIComponent(user.id)}/revoke`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not revoke access.");
      setNotice(`Revoked access for ${user.email ?? user.username ?? "user"}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke access.");
    } finally {
      setBusy(false);
    }
  };

  const onRegrant = async (user: AccessUser) => {
    const nextRole = role || "operator";
    const nextUser = username || user.username || (user.email ? user.email.split("@")[0] : "");
    if (!nextUser) {
      setError("Enter a username in the invite form, then re-grant.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/access/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole, username: nextUser }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not re-grant access.");
      setNotice(`Re-granted access to ${user.email ?? nextUser} as ${nextRole}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not re-grant access.");
    } finally {
      setBusy(false);
    }
  };

  const onRevokeInvite = async (inv: Invitation) => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/access/invitations/${encodeURIComponent(inv.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not revoke invitation.");
      setNotice(`Revoked invitation for ${inv.email}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke invitation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="settings-field-help settings-field-help--mb">
        Invite people by email. Once they accept, they sign in with Google or an
        email code, and MOID uses the username and role you set here. A GM has
        the same plant capabilities as you, but cannot open this screen.
      </p>

      {error ? (
        <p className="settings-field-help settings-field-help--warn" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="settings-field-help">{notice}</p> : null}

      <form onSubmit={onInvite} className="settings-field-grid" style={{ marginBottom: 24 }}>
        <label className="settings-field">
          <span className="settings-field-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="off"
            placeholder="name@company.com"
            disabled={busy}
          />
        </label>
        <label className="settings-field">
          <span className="settings-field-label">MOID username</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="off"
            placeholder="r.kumar"
            disabled={busy}
          />
        </label>
        <label className="settings-field">
          <span className="settings-field-label">Role</span>
          <Select
            value={role}
            onChange={setRole}
            options={(roles.length ? roles : [{ roleId: "operator", label: "Operator" }]).map((r) => ({
              value: r.roleId,
              label: r.label,
            }))}
            disabled={busy}
          />
        </label>
        <div className="settings-field" style={{ alignSelf: "end" }}>
          <button type="submit" className="settings-btn settings-btn--primary" disabled={busy}>
            {busy ? "Working…" : "Invite"}
          </button>
        </div>
      </form>

      <h3 className="settings-panel-title" style={{ fontSize: 16, marginBottom: 8 }}>
        People
      </h3>
      {loading ? (
        <p className="settings-field-help">Loading…</p>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email ?? "—"}</td>
                  <td>{u.username ?? "—"}</td>
                  <td>
                    {u.status === "mapped" ? (
                      <Select
                        value={u.role ?? ""}
                        onChange={(v) => void onChangeRole(u, v)}
                        options={roles.map((r) => ({ value: r.roleId, label: r.label }))}
                        disabled={busy}
                      />
                    ) : (
                      u.roleLabel ?? u.role ?? "—"
                    )}
                  </td>
                  <td>{u.status}</td>
                  <td>{formatWhen(u.lastSignInAt)}</td>
                  <td>
                    {u.status === "mapped" ? (
                      <button
                        type="button"
                        className="settings-btn settings-btn--ghost"
                        onClick={() => void onRevoke(u)}
                        disabled={busy}
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="settings-btn settings-btn--ghost"
                        onClick={() => void onRegrant(u)}
                        disabled={busy}
                      >
                        Re-grant
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6}>No Clerk users yet. Send an invitation to start.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="settings-panel-title" style={{ fontSize: 16, margin: "24px 0 8px" }}>
        Pending invitations
      </h3>
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Username</th>
              <th>Role</th>
              <th>Sent</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.email}</td>
                <td>{inv.username ?? "—"}</td>
                <td>{inv.role ?? "—"}</td>
                <td>{formatWhen(inv.createdAt)}</td>
                <td>
                  <button
                    type="button"
                    className="settings-btn settings-btn--ghost"
                    onClick={() => void onRevokeInvite(inv)}
                    disabled={busy}
                  >
                    Revoke invite
                  </button>
                </td>
              </tr>
            ))}
            {invitations.length === 0 ? (
              <tr>
                <td colSpan={5}>No pending invitations.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

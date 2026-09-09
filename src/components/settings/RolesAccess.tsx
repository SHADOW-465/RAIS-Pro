"use client";

// Roles & access — who exists, what they may open, and who signs in as them.
//
// Two panes, matching /schema: the thing you are choosing on the left, what it
// contains on the right. The picker is the same tree component Data Schema
// uses, because "which parts of the plant does this role get" is the same
// question shape as "which stages hold this defect", and a GM who has learned
// one folder view should not have to learn a second.
//
// Grants are held here as a flat Set and only converted on save. The server
// re-derives navAllow and capabilities from the same set (POST/PATCH
// /api/roles), so the three access columns cannot drift apart — nothing in this
// file decides what a grant MEANS.

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/editorial/Icon";
import Select from "@/components/ui/Select";
import SchemaTree, { type TreeNode } from "@/components/schema/SchemaTree";
import { filterTree } from "@/lib/schema/tree";
import {
  buildAccessTree,
  checkState,
  toggleNode,
  withCounts,
  type AccessNode,
} from "@/lib/access/tree";
import { grantsFromRole } from "@/lib/access/catalog";
import { useRegistry } from "@/components/app/RegistryContext";
import { NAV_ROUTES, ROUTED_NAV_KEYS } from "@/lib/nav-keys";
import type { PersonaCapabilities } from "@/lib/persona";

interface RoleRow {
  roleId: string;
  label: string;
  title: string;
  initial: string;
  homeHref: string;
  navAllow: string[];
  capabilities: PersonaCapabilities;
  grants: string[];
  scope: { stages: string[] };
  builtin: boolean;
  active: boolean;
  sortOrder: number;
}

interface UserRow {
  username: string;
  displayName: string;
  role: string;
  active: boolean;
}

const HOME_OPTIONS = ROUTED_NAV_KEYS.map((k) => ({
  value: NAV_ROUTES[k].href as string,
  label: NAV_ROUTES[k].label,
}));

const FULL_TREE = buildAccessTree();

/** A role that exists only in the form until it is saved. */
const blankRole = (): RoleRow => ({
  roleId: "",
  label: "",
  title: "",
  initial: "?",
  homeHref: "/",
  navAllow: [],
  capabilities: { write: false, approve: false, configure: false, eraseLedger: false },
  grants: [],
  scope: { stages: [] },
  builtin: false,
  active: true,
  sortOrder: 100,
});

export default function RolesAccess() {
  const { registry } = useRegistry();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [actingRole, setActingRole] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RoleRow>(blankRole);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [treeQuery, setTreeQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["section.overview"]));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // New-login form, scoped to whichever role is open.
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, usersRes] = await Promise.all([
        fetch("/api/roles", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/users", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (rolesRes.status === 403) {
        setError("Only a role with permission to change settings may manage roles.");
        return;
      }
      if (!rolesRes.ok) throw new Error((await rolesRes.json())?.error ?? "Failed to load roles.");
      const data = await rolesRes.json();
      setRoles(data.roles ?? []);
      setCounts(data.activeUserCounts ?? {});
      setActingRole(data.actingRole ?? null);
      if (usersRes.ok) setUsers((await usersRes.json()).users ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Open a role: its stored grants become the working set. */
  const openRole = useCallback((role: RoleRow) => {
    setCreating(false);
    setSelectedId(role.roleId);
    setDraft({ ...role, scope: { stages: [...(role.scope?.stages ?? [])] } });
    // A role saved before the grants column existed has none stored; fall back
    // to deriving them from navAllow + capabilities so the tree is never blank
    // for a role that plainly has access.
    setGrants(
      role.grants.length > 0
        ? new Set(role.grants)
        : grantsFromRole({ navAllow: role.navAllow as never, capabilities: role.capabilities }),
    );
    setNotice(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!selectedId && !creating && roles.length > 0) openRole(roles[0]);
  }, [roles, selectedId, creating, openRole]);

  const startNew = () => {
    setCreating(true);
    setSelectedId(null);
    setDraft(blankRole());
    setGrants(new Set());
    setNotice(null);
    setError(null);
  };

  const tree = useMemo(() => withCounts(FULL_TREE, grants), [grants]);
  const { nodes: visible, expand: searchExpand } = useMemo(
    () => filterTree(tree, treeQuery),
    [tree, treeQuery],
  );
  const effectiveExpanded = useMemo(
    () => (treeQuery.trim() ? new Set([...expanded, ...searchExpand]) : expanded),
    [treeQuery, expanded, searchExpand],
  );

  /** The tree hands back a bare row; find our node so we can walk its children. */
  const nodeById = useCallback((id: string): AccessNode | null => {
    const walk = (list: AccessNode[]): AccessNode | null => {
      for (const n of list) {
        if (n.id === id) return n;
        const hit = walk(n.children);
        if (hit) return hit;
      }
      return null;
    };
    return walk(FULL_TREE);
  }, []);

  const granted = useMemo(() => roles.find((r) => r.roleId === selectedId), [roles, selectedId]);
  const dirty = useMemo(() => {
    if (creating) return true;
    if (!granted) return false;
    const stored = granted.grants.length > 0 ? new Set(granted.grants) : grantsFromRole({
      navAllow: granted.navAllow as never,
      capabilities: granted.capabilities,
    });
    if (stored.size !== grants.size) return true;
    for (const g of grants) if (!stored.has(g)) return true;
    return (
      draft.label !== granted.label ||
      draft.title !== granted.title ||
      draft.homeHref !== granted.homeHref ||
      draft.active !== granted.active ||
      draft.scope.stages.join("|") !== (granted.scope?.stages ?? []).join("|")
    );
  }, [creating, granted, grants, draft]);

  async function send(method: string, body: unknown, query = "") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/roles${query}`, {
        method,
        credentials: "same-origin",
        ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Request failed.");
        return null;
      }
      await load();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    const payload = {
      roleId: creating ? draft.roleId : selectedId,
      label: draft.label,
      title: draft.title,
      homeHref: draft.homeHref,
      active: draft.active,
      scope: draft.scope,
      grants: [...grants],
    };
    const ok = await send(creating ? "POST" : "PATCH", payload);
    if (ok) {
      setNotice(creating ? `Created ${draft.label}.` : `Saved ${draft.label}.`);
      if (creating) {
        setCreating(false);
        setSelectedId(payload.roleId as string);
      }
    }
  }

  async function onDelete() {
    if (!selectedId) return;
    if (!window.confirm(`Delete the ${draft.label} role? Its access settings are lost.`)) return;
    const ok = await send("DELETE", undefined, `?roleId=${encodeURIComponent(selectedId)}`);
    if (ok) {
      setSelectedId(null);
      setNotice(`Deleted ${draft.label}.`);
    }
  }

  async function onCreateLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          displayName: newName,
          role: selectedId,
          password: newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Could not create the login.");
        return;
      }
      setNotice(
        `Created ${newUsername}. Give them this password directly — it is stored hashed and cannot be shown again.`,
      );
      setNewName("");
      setNewUsername("");
      setNewPassword("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const roleUsers = users.filter((u) => u.role === selectedId);

  if (error && roles.length === 0 && !loading) {
    return <p className="settings-admin-warn">{error}</p>;
  }
  if (loading) return <p className="settings-admin-body">Loading roles…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {notice && <p className="settings-admin-body" style={{ color: "var(--accent)" }}>{notice}</p>}
      {error && <p className="settings-admin-warn">{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 240px) 1fr", gap: 16, alignItems: "start" }}>
        {/* ── Roles ─────────────────────────────────────────────────────── */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
          }}
        >
          {roles.map((r) => {
            const on = r.roleId === selectedId && !creating;
            const held = counts[r.roleId] ?? 0;
            return (
              <button
                key={r.roleId}
                onClick={() => openRole(r)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "9px 10px",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  background: on ? "var(--accent-weak)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                  opacity: r.active ? 1 : 0.55,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 550 }}>{r.label}</span>
                  <span className="small" style={{ color: "var(--text-3)" }}>
                    {held > 0 ? `${held} login${held === 1 ? "" : "s"}` : r.title || "no logins"}
                    {r.active ? "" : " · disabled"}
                  </span>
                </span>
                {r.builtin && <Icon name="check" />}
              </button>
            );
          })}
          <button
            onClick={startNew}
            className="settings-btn settings-btn--ghost"
            style={{ width: "100%", borderRadius: 0, padding: "10px" }}
          >
            + New role
          </button>
        </div>

        {/* ── The selected role ─────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section>
            <h3 className="settings-admin-title">{creating ? "New role" : draft.label || "Role"}</h3>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              {creating && (
                <label style={{ display: "grid", gap: 4 }}>
                  <span className="small">Role id</span>
                  <input
                    className="settings-input"
                    value={draft.roleId}
                    onChange={(e) => setDraft({ ...draft, roleId: e.target.value })}
                    placeholder="supervisor.moulding"
                  />
                </label>
              )}
              <label style={{ display: "grid", gap: 4 }}>
                <span className="small">Name</span>
                <input
                  className="settings-input"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="Supervisor — Moulding"
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span className="small">Description</span>
                <input
                  className="settings-input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Line oversight"
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span className="small">Opens on</span>
                <Select
                  value={draft.homeHref}
                  onChange={(v) => setDraft({ ...draft, homeHref: v })}
                  options={HOME_OPTIONS}
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="settings-admin-title">Feature access</h3>
            <p className="settings-admin-body" style={{ marginTop: -4 }}>
              Anything left unticked is denied. Un-ticking a screen removes it from the sidebar and
              blocks the actions underneath it.
            </p>
            <input
              className="settings-input"
              value={treeQuery}
              onChange={(e) => setTreeQuery(e.target.value)}
              placeholder="Search features…"
              style={{ marginBottom: 8 }}
            />
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                maxHeight: 380,
                overflowY: "auto",
              }}
            >
              <SchemaTree
                label="Feature access"
                nodes={visible as TreeNode[]}
                expanded={effectiveExpanded}
                onToggle={(id) =>
                  setExpanded((cur) => {
                    const next = new Set(cur);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                selectedId={selectedNodeId}
                onSelect={(n) => setSelectedNodeId(n.id)}
                checkState={(n) => {
                  const node = nodeById(n.id);
                  return node ? checkState(node, grants) : "off";
                }}
                onCheck={(n) => {
                  const node = nodeById(n.id);
                  if (node) setGrants(toggleNode(node, grants));
                }}
              />
            </div>
          </section>

          <section>
            <h3 className="settings-admin-title">Data scope</h3>
            <p className="settings-admin-body" style={{ marginTop: -4 }}>
              Leave every stage unticked and this role sees the whole plant, which is
              what every role does today. Tick stages and the server sends only those
              rows — their totals are their line&rsquo;s, not a smaller version of the
              plant&rsquo;s. Records with no stage of their own are always included.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {((registry?.stages ?? []) as { stageId: string; label?: string }[]).map((st) => {
                const id = st.stageId;
                const on = draft.scope.stages.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        scope: {
                          stages: on
                            ? draft.scope.stages.filter((x) => x !== id)
                            : [...draft.scope.stages, id],
                        },
                      })
                    }
                    style={{
                      padding: "5px 10px",
                      borderRadius: 30,
                      fontSize: 12,
                      cursor: "pointer",
                      font: "inherit",
                      fontWeight: 550,
                      border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                      background: on ? "var(--accent-weak)" : "transparent",
                      color: "inherit",
                    }}
                  >
                    {st.label ?? id}
                  </button>
                );
              })}
              {(registry?.stages ?? []).length === 0 && (
                <span className="small" style={{ color: "var(--text-3)" }}>
                  No stages in the plant catalog yet.
                </span>
              )}
            </div>
            {draft.scope.stages.length > 0 && (
              <p className="settings-admin-warn" style={{ marginTop: 10 }}>
                <Icon name="alert" /> Every number this role sees will be limited to{" "}
                {draft.scope.stages.length} stage{draft.scope.stages.length === 1 ? "" : "s"},
                the dashboard and their own entry history included.
              </p>
            )}
          </section>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="settings-btn settings-btn--primary"
              onClick={onSave}
              disabled={busy || !dirty || !draft.label.trim() || (creating && !draft.roleId.trim())}
            >
              {busy ? "Saving…" : creating ? "Create role" : "Save changes"}
            </button>
            {!creating && selectedId && (
              <>
                <button
                  className="settings-btn settings-btn--ghost"
                  onClick={() => send("PATCH", { roleId: selectedId, active: !draft.active })}
                  disabled={busy || draft.roleId === actingRole}
                >
                  {draft.active ? "Disable role" : "Enable role"}
                </button>
                <button
                  className="settings-btn settings-btn--ghost"
                  onClick={onDelete}
                  disabled={busy || draft.builtin || draft.roleId === actingRole}
                  title={draft.builtin ? "Built-in roles cannot be deleted." : undefined}
                >
                  Delete role
                </button>
              </>
            )}
            {dirty && !creating && (
              <span className="small" style={{ color: "var(--text-3)" }}>
                Unsaved changes
              </span>
            )}
          </div>

          {/* ── Logins ──────────────────────────────────────────────────── */}
          {!creating && selectedId && (
            <section>
              <h3 className="settings-admin-title">Logins with this role ({roleUsers.length})</h3>
              {roleUsers.length === 0 ? (
                <p className="settings-admin-body">
                  Nobody signs in as this role yet.
                </p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", display: "grid", gap: 4 }}>
                  {roleUsers.map((u) => (
                    <li key={u.username} className="small" style={{ opacity: u.active ? 1 : 0.55 }}>
                      {u.displayName}{" "}
                      <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
                        {u.username}
                      </span>
                      {u.active ? "" : " · disabled"}
                    </li>
                  ))}
                </ul>
              )}
              <form
                onSubmit={onCreateLogin}
                style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" }}
              >
                <label style={{ display: "grid", gap: 4 }}>
                  <span className="small">Full name</span>
                  <input className="settings-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="R. Kumar" required />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span className="small">Username</span>
                  <input className="settings-input" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="r.kumar" required />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span className="small">Initial password</span>
                  <input className="settings-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="at least 8 characters" required />
                </label>
                <button type="submit" className="settings-btn settings-btn--primary" disabled={busy}>
                  Create login
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

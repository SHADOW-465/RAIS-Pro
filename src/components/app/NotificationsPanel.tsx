"use client";

import React, { useCallback, useEffect, useState } from "react";
import Icon from "@/components/editorial/Icon";
import { usePersona } from "@/components/app/PersonaContext";
import { useConfirm } from "@/components/ui/ConfirmContext";
import type {
  PlantNotification,
  EntryExceptionPayload,
  EditRequestPayload,
} from "@/lib/notifications/types";
import { issueGrant } from "@/lib/entry/edit-grants";
import { NOTIFICATIONS_CHANGED, notifyNotificationsChanged } from "@/lib/client/live-signals";

type Tab = "open" | "history";

export default function NotificationsPanel() {
  const { persona, canApprove } = usePersona();
  const { notify } = useConfirm();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("open");
  const [items, setItems] = useState<PlantNotification[]>([]);
  const [count, setCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = tab === "open" ? "open" : "closed";
      const res = await fetch(`/api/notifications?status=${status}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications ?? []);
      setCount(data.openCount ?? 0);
    } catch {
      /* ignore */
    }
  }, [tab]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    const onChange = () => void refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED, onChange);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, tab, refresh]);

  async function act(
    id: string,
    action: "ack" | "approve" | "deny",
    n?: PlantNotification,
  ) {
    setBusyId(id);
    try {
      const note = (ackNote[id] ?? "").trim();
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          action,
          actorPersona: persona,
          note: note || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify(body.error ?? "Action failed", "error");
        return;
      }
      const data = await res.json();
      if (action === "approve" && n?.type === "edit_request") {
        const p = n.payload as EditRequestPayload;
        if (p?.entryKey) {
          issueGrant({
            entryKey: p.entryKey,
            approvedBy: persona,
            notificationId: id,
          });
        } else if (data.grant?.entryKey) {
          issueGrant({
            entryKey: data.grant.entryKey,
            approvedBy: persona,
            notificationId: id,
          });
        }
      }
      setAckNote((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      notifyNotificationsChanged();
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (persona === "operator") {
    return null;
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          void refresh();
        }}
        aria-label={`Notifications${count ? `, ${count} open` : ""}`}
        aria-expanded={open}
        style={{
          position: "relative",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "50%",
          width: 32,
          height: 32,
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          boxShadow: "var(--shadow-sm)",
          color: "var(--text)",
        }}
      >
        <Icon name="alert" size={14} />
        {count > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: "var(--accent)",
              color: "var(--text-invert, #fff)",
              fontSize: 9,
              fontWeight: 800,
              display: "grid",
              placeItems: "center",
              padding: "0 4px",
            }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: 8,
            width: 400,
            maxHeight: 480,
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 12,
            boxShadow: "var(--shadow-lg)",
            zIndex: 250,
            padding: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 8px 10px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-3)",
              }}
            >
              Alerts {count > 0 ? `· ${count} open` : ""}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <TabChip active={tab === "open"} onClick={() => setTab("open")}>
                Open
              </TabChip>
              <TabChip active={tab === "history"} onClick={() => setTab("history")}>
                History
              </TabChip>
            </div>
          </div>
          <a
            href="/alerts"
            style={{
              display: "block",
              padding: "4px 8px 10px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--accent-text)",
              textDecoration: "none",
            }}
          >
            Open alerts page →
          </a>

          {items.length === 0 && (
            <div style={{ padding: 16, fontSize: 12.5, color: "var(--text-3)", textAlign: "center" }}>
              {tab === "open" ? "No open alerts." : "No acknowledged or closed alerts yet."}
            </div>
          )}

          {items.map((n) => {
            const expanded = expandedId === n.id;
            const isException = n.type === "entry_exception";
            const isEdit = n.type === "edit_request";
            const p = n.payload as EntryExceptionPayload & EditRequestPayload;
            return (
              <div
                key={n.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 8,
                  background: "var(--surface-2)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, color: "var(--text)" }}>
                      {n.title}
                    </div>
                    <StatusPill status={n.status} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : n.id)}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--accent-text)",
                      fontFamily: "inherit",
                      flexShrink: 0,
                    }}
                  >
                    {expanded ? "Less" : "Details"}
                  </button>
                </div>

                <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.45, marginBottom: 8 }}>
                  {n.body}
                </div>

                {(expanded || isException) && isException && (
                  <ExceptionFacts p={p as EntryExceptionPayload} />
                )}
                {expanded && isEdit && <EditFacts p={p as EditRequestPayload} />}

                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-3)",
                    marginBottom: 8,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  Raised {new Date(n.createdAt).toLocaleString()} by {n.createdBy}
                </div>

                {n.history && n.history.length > 0 && (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: "var(--text-3)",
                        marginBottom: 6,
                      }}
                    >
                      Action trail
                    </div>
                    {n.history.map((h, i) => (
                      <div
                        key={`${h.at}-${i}`}
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-2)",
                          lineHeight: 1.4,
                          marginBottom: i < n.history.length - 1 ? 4 : 0,
                        }}
                      >
                        <strong style={{ color: "var(--text)" }}>{labelAction(h.action)}</strong>
                        {" · "}
                        {h.by}
                        {" · "}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                          {new Date(h.at).toLocaleString()}
                        </span>
                        {h.note ? (
                          <div style={{ marginTop: 2, color: "var(--text-3)" }}>Note: {h.note}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {n.status === "open" && canApprove && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input
                      type="text"
                      value={ackNote[n.id] ?? ""}
                      onChange={(e) =>
                        setAckNote((prev) => ({ ...prev, [n.id]: e.target.value }))
                      }
                      placeholder={
                        isException
                          ? "Optional note (e.g. Reviewed — hold accepted)"
                          : "Optional note on approval/denial"
                      }
                      aria-label="Resolution note"
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--border-strong)",
                        background: "var(--bg)",
                        fontSize: 12,
                        fontFamily: "inherit",
                        color: "var(--text)",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {isException && (
                        <button
                          type="button"
                          disabled={busyId === n.id}
                          onClick={() => void act(n.id, "ack", n)}
                          style={btnSmPrimary}
                        >
                          {busyId === n.id ? "…" : "Acknowledge & close"}
                        </button>
                      )}
                      {isEdit && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === n.id}
                            onClick={() => void act(n.id, "approve", n)}
                            style={btnSmPrimary}
                          >
                            Approve edit
                          </button>
                          <button
                            type="button"
                            disabled={busyId === n.id}
                            onClick={() => void act(n.id, "deny", n)}
                            style={btnSm}
                          >
                            Deny
                          </button>
                        </>
                      )}
                      {p.path && (
                        <a
                          href={
                            p.batchId
                              ? `${p.path}?batch=${encodeURIComponent(p.batchId)}${p.date ? `&date=${p.date}` : ""}`
                              : p.path
                          }
                          style={{
                            ...btnSm,
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          Open entry
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {n.status === "open" && !canApprove && (
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    View only — GM must acknowledge or act
                  </span>
                )}

                {n.status !== "open" && (
                  <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
                    Closed · {n.resolvedBy ?? "—"} ·{" "}
                    {n.resolvedAt ? new Date(n.resolvedAt).toLocaleString() : ""}
                    {n.resolutionNote ? ` · “${n.resolutionNote}”` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
        background: active ? "var(--accent-weak)" : "var(--surface)",
        color: active ? "var(--accent-text)" : "var(--text-2)",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: PlantNotification["status"] }) {
  const map: Record<PlantNotification["status"], { bg: string; fg: string; label: string }> = {
    open: { bg: "var(--warning-weak)", fg: "var(--warning)", label: "Open" },
    acked: { bg: "var(--positive-weak)", fg: "var(--positive)", label: "Acknowledged" },
    approved: { bg: "var(--positive-weak)", fg: "var(--positive)", label: "Approved" },
    denied: { bg: "var(--critical-weak)", fg: "var(--critical)", label: "Denied" },
  };
  const s = map[status] ?? map.open;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
      }}
    >
      {s.label}
    </span>
  );
}

function ExceptionFacts({ p }: { p: EntryExceptionPayload }) {
  const rows: { label: string; value: string }[] = [];
  if (p.batchId) rows.push({ label: "Batch", value: p.batchId });
  if (p.date) rows.push({ label: "Date", value: p.date });
  if (p.processName || p.stageName) rows.push({ label: "Station", value: p.processName || p.stageName || "" });
  if (p.size) rows.push({ label: "Size", value: p.size });
  if (p.operator) rows.push({ label: "Operator", value: p.operator });
  if (p.checked != null) rows.push({ label: "Checked", value: String(p.checked) });
  if (p.accept != null) rows.push({ label: "Accept", value: String(p.accept) });
  if (p.hold != null && p.hold > 0) rows.push({ label: "Hold", value: String(p.hold) });
  if (p.reject != null) rows.push({ label: "Reject", value: String(p.reject) });
  if (p.defectSum != null) rows.push({ label: "Defect sum", value: String(p.defectSum) });
  if (p.detail) rows.push({ label: "Math", value: p.detail });
  if (p.reason) rows.push({ label: "Operator reason", value: p.reason });
  if (p.a12Choice === "keep-incomplete") {
    rows.push({ label: "Choice", value: "Kept Rejected; defects incomplete" });
  }

  return (
    <div
      style={{
        marginBottom: 8,
        padding: "8px 10px",
        borderRadius: 8,
        background: "color-mix(in srgb, var(--status-warn, #d97706) 10%, var(--surface))",
        border: "1px solid color-mix(in srgb, var(--status-warn, #d97706) 28%, var(--border))",
        fontSize: 11.5,
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{r.label}</span>
          <span
            style={{
              fontWeight: 600,
              color: "var(--text)",
              textAlign: "right",
              fontFamily: r.label === "Batch" || r.label === "Math" ? "var(--font-mono)" : "inherit",
              wordBreak: "break-word",
            }}
          >
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function EditFacts({ p }: { p: EditRequestPayload }) {
  return (
    <div
      style={{
        marginBottom: 8,
        padding: "8px 10px",
        borderRadius: 8,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        fontSize: 11.5,
        fontFamily: "var(--font-mono)",
        color: "var(--text-2)",
        lineHeight: 1.45,
      }}
    >
      {p.batchId} · {p.stageName || p.stageId} · {p.size}
      {p.date ? ` · ${p.date}` : ""}
      {p.operator ? ` · ${p.operator}` : ""}
    </div>
  );
}

function labelAction(a: string): string {
  if (a === "ack") return "Acknowledged";
  if (a === "approve") return "Approved";
  if (a === "deny") return "Denied";
  return a;
}

const btnSm: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  color: "var(--text-2)",
};

const btnSmPrimary: React.CSSProperties = {
  ...btnSm,
  background: "var(--accent)",
  border: "none",
  color: "var(--text-invert, #fff)",
  fontWeight: 700,
};

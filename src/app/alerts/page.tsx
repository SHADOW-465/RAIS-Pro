"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import AppShell from "@/components/app/AppShell";
import { usePersona } from "@/components/app/PersonaContext";
import { useConfirm } from "@/components/ui/ConfirmContext";
import DatePicker from "@/components/ui/DatePicker";
import type { PlantNotification } from "@/lib/notifications/types";
import { NOTIFICATIONS_CHANGED, notifyNotificationsChanged } from "@/lib/client/live-signals";
import {
  classifyAlert,
  groupAlerts,
  timelineBuckets,
  inRange,
  type AlertGroupBy,
  type TimelineGrain,
} from "@/lib/notifications/classify";

type StatusFilter = "open" | "closed" | "all";

export default function AlertsPage() {
  const { persona, canApprove } = usePersona();
  const { notify } = useConfirm();
  const [items, setItems] = useState<PlantNotification[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [grain, setGrain] = useState<TimelineGrain>("day");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupBy, setGroupBy] = useState<AlertGroupBy>("page");
  const [period, setPeriod] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/notifications?status=${status}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.notifications ?? []);
    setOpenCount(data.openCount ?? 0);
  }, [status]);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED, onChange);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, onChange);
  }, [refresh]);

  const ranged = useMemo(
    () => items.filter((n) => inRange(n, from || undefined, to || undefined)),
    [items, from, to],
  );

  const q = query.trim().toLowerCase();
  const searched = useMemo(() => {
    if (!q) return ranged;
    return ranged.filter((n) => {
      const place = classifyAlert(n);
      const hay = `${n.title} ${n.body} ${n.createdBy} ${place.pageLabel} ${place.processLabel} ${place.stageLabel}`.toLowerCase();
      return hay.includes(q);
    });
  }, [ranged, q]);

  const timeline = useMemo(() => timelineBuckets(searched, grain), [searched, grain]);

  const inPeriod = useMemo(() => {
    if (!period || grain === "all") return searched;
    return timeline.find((b) => b.period === period)?.items ?? searched;
  }, [searched, timeline, period, grain]);

  const groups = useMemo(() => groupAlerts(inPeriod, groupBy), [inPeriod, groupBy]);

  async function act(id: string, action: "ack" | "approve" | "deny") {
    if (!canApprove) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        notify(body.error ?? "Action failed", "error");
        return;
      }
      notifyNotificationsChanged();
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell active="alerts">
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1100 }}>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 800,
              margin: "0 0 4px",
              color: "var(--text)",
            }}
          >
            Alerts
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0, maxWidth: "70ch" }}>
            History of plant messages. Group by page, process, or station. The timeline grain is yours to change.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          <Stat label="Open" value={openCount} />
          <Stat label="In view" value={inPeriod.length} />
          <Stat label="Groups" value={groups.length} />
        </div>

        <section style={panel}>
          <div style={row}>
            <span style={eyebrow}>Status</span>
            <Chips
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPeriod(null);
              }}
              options={[
                ["open", "Open"],
                ["closed", "History"],
                ["all", "All"],
              ]}
            />
          </div>
          <div style={row}>
            <span style={eyebrow}>Timeline</span>
            <Chips
              value={grain}
              onChange={(v) => {
                setGrain(v);
                setPeriod(null);
              }}
              options={[
                ["day", "Day"],
                ["week", "Week"],
                ["month", "Month"],
                ["all", "All time"],
              ]}
            />
          </div>
          <div style={{ ...row, alignItems: "flex-end" }}>
            <span style={eyebrow}>Range</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>From</div>
                <DatePicker value={from} onChange={setFrom} ariaLabel="From date" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>To</div>
                <DatePicker value={to} onChange={setTo} ariaLabel="To date" />
              </div>
              {(from || to) && (
                <button type="button" onClick={() => { setFrom(""); setTo(""); }} style={ghostBtn}>
                  Clear range
                </button>
              )}
            </div>
          </div>
          <div style={row}>
            <span style={eyebrow}>Group</span>
            <Chips
              value={groupBy}
              onChange={setGroupBy}
              options={[
                ["page", "Page-wise"],
                ["process", "Process-wise"],
                ["stage", "Stage-wise"],
              ]}
            />
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, lot, station…"
            aria-label="Search alerts"
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-strong)",
              background: "var(--surface-2)",
              color: "var(--text)",
              fontSize: 13,
              width: "100%",
              maxWidth: 360,
              boxSizing: "border-box",
            }}
          />
        </section>

        {grain !== "all" && timeline.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setPeriod(null)}
              style={chipStyle(!period)}
            >
              Whole range · {searched.length}
            </button>
            {timeline.map((b) => (
              <button
                key={b.period}
                type="button"
                onClick={() => setPeriod(b.period === period ? null : b.period)}
                style={chipStyle(period === b.period)}
              >
                {b.label} · {b.items.length}
              </button>
            ))}
          </div>
        )}

        {groups.length === 0 && (
          <p className="muted" style={{ fontSize: 13 }}>
            No alerts in this view.
          </p>
        )}

        {groups.map((g) => (
          <section key={g.key} style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                {g.label}
              </h2>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>
                {g.items.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.items.map((n) => (
                <AlertCard
                  key={n.id}
                  n={n}
                  expanded={expandedId === n.id}
                  onToggle={() => setExpandedId(expandedId === n.id ? null : n.id)}
                  canAct={canApprove && n.status === "open"}
                  busy={busyId === n.id}
                  onAct={(action) => act(n.id, action)}
                  persona={persona}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}

function AlertCard({
  n,
  expanded,
  onToggle,
  canAct,
  busy,
  onAct,
  persona,
}: {
  n: PlantNotification;
  expanded: boolean;
  onToggle: () => void;
  canAct: boolean;
  busy: boolean;
  onAct: (a: "ack" | "approve" | "deny") => void;
  persona: string;
}) {
  const place = classifyAlert(n);
  return (
    <article
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 12,
        background: "var(--surface-2)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text)" }}>{n.title}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
            {place.pageLabel} · {place.processLabel} · {place.stageLabel}
          </div>
        </div>
        <StatusPill status={n.status} />
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-2)" }}>{n.body}</p>
      <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-3)", marginTop: 8 }}>
        {new Date(n.createdAt).toLocaleString()} · {n.createdBy}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={onToggle} style={ghostBtn}>
          {expanded ? "Hide history" : "History"}
        </button>
        {canAct && n.type === "entry_exception" && (
          <button type="button" disabled={busy} onClick={() => onAct("ack")} style={ghostBtn}>
            Acknowledge
          </button>
        )}
        {canAct && n.type === "edit_request" && persona !== "operator" && (
          <>
            <button type="button" disabled={busy} onClick={() => onAct("approve")} style={ghostBtn}>
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => onAct("deny")} style={ghostBtn}>
              Deny
            </button>
          </>
        )}
      </div>

      {expanded && (
        <ol style={{ margin: "12px 0 0", padding: "10px 10px 10px 28px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <li style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 6 }}>
            Raised {new Date(n.createdAt).toLocaleString()} by {n.createdBy}
          </li>
          {(n.history ?? []).length === 0 && (
            <li style={{ fontSize: 12.5, color: "var(--text-3)" }}>No further actions yet.</li>
          )}
          {(n.history ?? []).map((h, i) => (
            <li key={i} style={{ fontSize: 12.5, color: "var(--text-2)", marginBottom: 6 }}>
              <strong style={{ color: "var(--text)" }}>{h.action}</strong> by {h.by} · {new Date(h.at).toLocaleString()}
              {h.note ? ` — ${h.note}` : ""}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ ...panel, padding: "12px 14px" }}>
      <div style={eyebrow}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "open" ? "var(--warning)" : status === "denied" ? "var(--critical)" : "var(--positive)";
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderRadius: 999,
        padding: "2px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

function Chips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][] | readonly (readonly [T, string])[];
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} style={chipStyle(value === v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const panel: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: 16,
  boxShadow: "var(--shadow-1)",
};
const row: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 };
const eyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};
const ghostBtn: CSSProperties = {
  padding: "5px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
function chipStyle(on: boolean): CSSProperties {
  return {
    padding: "5px 10px",
    borderRadius: 999,
    border: on ? "1.5px solid var(--accent)" : "1px solid var(--border)",
    background: on ? "var(--accent-weak)" : "var(--surface-2)",
    color: "var(--text)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  };
}

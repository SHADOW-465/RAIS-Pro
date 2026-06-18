"use client";

// The single app shell (sidebar + topbar + status bar) every screen renders in,
// matching the approved cockpit mockup. Dashboard-first; ingestion lives inside
// Data Entry and Staging & Review — never a separate landing.

import { useRouter } from "next/navigation";
import Icon, { type IconName } from "@/components/editorial/Icon";

export type NavKey =
  | "dashboard" | "data-entry" | "staging" | "stage" | "size" | "defect"
  | "spc" | "process-flow" | "copq" | "reports" | "capa" | "ask" | "audit" | "settings";

interface NavItem { key: NavKey; label: string; icon: IconName; href?: string; badge?: number; soon?: boolean; indent?: boolean }

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "table", href: "/" },
  { key: "data-entry", label: "Data Entry", icon: "file", href: "/data-entry" },
  { key: "staging", label: "Staging & Review", icon: "upload", href: "/staging" },
  { key: "stage", label: "Stage Analysis", icon: "trend-up", soon: true },
  { key: "size", label: "Size Analysis", icon: "tally", soon: true },
  { key: "defect", label: "Defect Analysis", icon: "spark", soon: true },
  { key: "spc", label: "SPC & Control Charts", icon: "trend-down", soon: true },
  { key: "process-flow", label: "Process Flow", icon: "split", soon: true },
  { key: "copq", label: "COPQ & Savings", icon: "lightning", soon: true },
  { key: "reports", label: "Reports", icon: "print", soon: true },
  { key: "capa", label: "CAPA & Actions", icon: "check", soon: true },
  { key: "ask", label: "Ask RAS", icon: "comment", soon: true },
  { key: "audit", label: "Audit Trail", icon: "search", soon: true },
  { key: "settings", label: "Settings", icon: "external", soon: true },
];

export default function AppShell({
  active, trustScore, statusCounts, children,
}: {
  active: NavKey;
  trustScore?: number | null;
  statusCounts?: { alerts?: number; capa?: number; overdue?: number; anomalies?: number };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const sc = statusCounts ?? {};
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "grid", gridTemplateColumns: "220px 1fr", gridTemplateRows: "auto 1fr auto", gridTemplateAreas: `"side top" "side main" "side status"` }}>
      {/* sidebar */}
      <aside style={{ gridArea: "side", borderRight: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: "var(--accent)" }}>MO!D</span>
          <span className="muted" style={{ fontSize: 10, lineHeight: 1.2 }}>Manufacturing Ops<br />Intelligence &amp; Diagnostics</span>
        </div>
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {NAV.map((n) => {
            const isActive = n.key === active;
            return (
              <button key={n.key} disabled={n.soon}
                onClick={() => n.href && router.push(n.href)}
                title={n.soon ? "Coming soon" : n.label}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 18px",
                  background: isActive ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "transparent",
                  borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
                  color: isActive ? "var(--accent)" : n.soon ? "var(--text-3)" : "var(--text-2)",
                  border: "none", borderLeftWidth: 3, borderLeftStyle: "solid", cursor: n.soon ? "default" : "pointer",
                  fontSize: 13, fontWeight: isActive ? 600 : 500, textAlign: "left",
                }}>
                <Icon name={n.icon} size={15} />
                <span style={{ flex: 1 }}>{n.label}</span>
                {n.badge ? <span style={{ background: "var(--status-bad)", color: "#fff", fontSize: 10, borderRadius: 10, padding: "1px 7px", fontFamily: "var(--font-mono)" }}>{n.badge}</span> : null}
                {n.soon ? <span className="muted" style={{ fontSize: 9 }}>soon</span> : null}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)" }}>
          <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Data Trust Score</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="check" size={16} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: "var(--status-good)" }}>{trustScore != null ? `${trustScore.toFixed(1)}%` : "—"}</span>
          </div>
        </div>
      </aside>

      {/* topbar */}
      <header style={{ gridArea: "top", borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 5 }}>
        <div style={{ display: "flex", gap: 18 }}>
          <Selector label="Plant" value="Disposable Baddi" />
          <Selector label="Line" value="FBC Line 1" />
          <Selector label="Date Range" value="01 Apr 2025 – 31 Mar 2026" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="muted" style={{ fontSize: 13 }}>Rajesh Kumar · Quality Manager</span>
          <button style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 9, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center" }}><Icon name="external" size={13} /> Export</button>
        </div>
      </header>

      {/* content */}
      <main style={{ gridArea: "main", overflowY: "auto", padding: "20px 24px" }}>{children}</main>

      {/* status bar */}
      <footer style={{ gridArea: "status", borderTop: "1px solid var(--border)", background: "var(--surface)", padding: "10px 24px", display: "flex", gap: 28, fontSize: 12 }}>
        <Status icon="alert" tone="var(--status-bad)" label="Active Alerts" value={`${sc.alerts ?? 0} Critical`} />
        <Status icon="check" tone="var(--status-good)" label="Pending CAPA" value={`${sc.capa ?? 0} Actions`} />
        <Status icon="minus" tone="var(--status-warn)" label="Overdue" value={`${sc.overdue ?? 0}`} />
        <Status icon="spark" tone="var(--accent)" label="Data Anomalies" value={`${sc.anomalies ?? 0}`} />
        <span style={{ marginLeft: "auto", color: "var(--text-3)" }}><Icon name="comment" size={12} /> Ask RAS (Rejection Advisory System)</span>
      </footer>
    </div>
  );
}

function Selector({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 10, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, border: "1px solid var(--border)", borderRadius: 7, padding: "5px 10px", background: "var(--bg)" }}>{value}</div>
    </div>
  );
}
function Status({ icon, tone, label, value }: { icon: IconName; tone: string; label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: tone }}><Icon name={icon} size={13} /></span>
      <span className="muted">{label}</span>
      <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{value}</strong>
    </span>
  );
}

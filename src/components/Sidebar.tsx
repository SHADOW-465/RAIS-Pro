"use client";

import { useState, useEffect } from "react";
import Icon from "./editorial/Icon";

interface SidebarProps {
  verifyMode: boolean;
  onVerifyToggle: () => void;
  hasRawData: boolean;
}

export default function Sidebar({
  verifyMode,
  onVerifyToggle,
  hasRawData,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Load initial collapse state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") {
      setCollapsed(true);
    }
  }, []);

  const handleToggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  return (
    <aside
      style={{
        width: collapsed ? 64 : 240,
        height: "100vh",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s cubic-bezier(0.2, 0.7, 0.2, 1)",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Brand area */}
      <div
        style={{
          padding: collapsed ? "20px 0" : "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 12,
          borderBottom: "1px solid var(--border)",
          height: 56,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "6px",
            background: "var(--accent)",
            color: "var(--text-invert)",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 14,
            fontFamily: "var(--font-display)",
          }}
        >
          R
        </div>
        {!collapsed && (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            RAIS <span style={{ fontWeight: 500, color: "var(--accent)" }}>Pro</span>
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav
        style={{
          flex: 1,
          padding: "24px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {/* Analysis Report Tab */}
        <button
          onClick={() => {
            if (verifyMode) onVerifyToggle();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: collapsed ? "12px 0" : "10px 16px",
            justifyContent: collapsed ? "center" : "flex-start",
            background: !verifyMode ? "var(--accent-weak)" : "transparent",
            color: !verifyMode ? "var(--accent-text)" : "var(--text-2)",
            borderLeft: !verifyMode ? "3px solid var(--accent)" : "3px solid transparent",
            borderRadius: collapsed ? "8px" : "0 8px 8px 0",
            width: "100%",
            cursor: "pointer",
            transition: "all 0.15s ease",
            fontWeight: !verifyMode ? 600 : 500,
            fontSize: 13,
            outline: "none",
            borderTop: "none",
            borderRight: "none",
            borderBottom: "none",
            textAlign: "left",
          }}
        >
          <Icon name="file" size={16} stroke={!verifyMode ? 2 : 1.6} />
          {!collapsed && <span>Analysis Report</span>}
        </button>

        {/* Verify Mode Tab */}
        {hasRawData && (
          <button
            onClick={() => {
              if (!verifyMode) onVerifyToggle();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: collapsed ? "12px 0" : "10px 16px",
              justifyContent: collapsed ? "center" : "flex-start",
              background: verifyMode ? "var(--accent-weak)" : "transparent",
              color: verifyMode ? "var(--accent-text)" : "var(--text-2)",
              borderLeft: verifyMode ? "3px solid var(--accent)" : "3px solid transparent",
              borderRadius: collapsed ? "8px" : "0 8px 8px 0",
              width: "100%",
              cursor: "pointer",
              transition: "all 0.15s ease",
              fontWeight: verifyMode ? 600 : 500,
              fontSize: 13,
              outline: "none",
              borderTop: "none",
            borderRight: "none",
            borderBottom: "none",
              textAlign: "left",
            }}
          >
            <Icon name="split" size={16} stroke={verifyMode ? 2 : 1.6} />
            {!collapsed && <span>Verify Mode</span>}
          </button>
        )}
      </nav>

      {/* Collapse button */}
      <div
        style={{
          padding: 12,
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: collapsed ? "center" : "flex-end",
        }}
      >
        <button
          onClick={handleToggleCollapse}
          className="btn ghost sm"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            padding: 0,
            display: "grid",
            placeItems: "center",
            borderTop: "none",
            borderRight: "none",
            borderBottom: "none",
            background: "transparent",
            cursor: "pointer",
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon name={collapsed ? "arrow-right" : "arrow-left"} size={14} />
        </button>
      </div>
    </aside>
  );
}

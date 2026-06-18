"use client";

import React from "react";
import Icon from "@/components/editorial/Icon";

interface FloatingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  insight: string | string[];
  children: React.ReactNode;
}

export default function FloatingDetailModal({
  isOpen,
  onClose,
  title,
  insight,
  children,
}: FloatingDetailModalProps) {
  if (!isOpen) return null;

  const insights = Array.isArray(insight) ? insight : [insight];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(18, 16, 14, 0.6)",
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="fade-up"
        style={{
          width: "100%",
          maxWidth: 960,
          background: "var(--bg)",
          border: "2px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        {/* Title Bar */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "2px solid var(--border-strong)",
            background: "var(--surface-2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                background: "var(--accent)",
                color: "var(--text-invert)",
                padding: "2px 6px",
                borderRadius: "4px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              RAIS
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 17,
                fontWeight: 800,
                color: "var(--text)",
              }}
            >
              Metric Detail: {title}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-3)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              padding: 4,
              borderRadius: "50%",
              transition: "background 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = "var(--surface-3)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Icon name="chevron-down" size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr",
            gap: 24,
          }}
        >
          {/* Left: Interactive widget in larger size */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface)",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              minHeight: 320,
            }}
          >
            {children}
          </div>

          {/* Right: AI Insights and Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-md)",
                background: "var(--accent-weak)",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    background: "var(--accent)",
                    color: "var(--text-invert)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  AI
                </span>
                <span
                  className="eyebrow accent"
                  style={{ fontWeight: 700, margin: 0, fontSize: 11 }}
                >
                  Diagnostic Insight
                </span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }}>
                {insights.map((item, index) => (
                  <li key={index} style={{ marginBottom: 8 }}>{item}</li>
                ))}
              </ul>
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-2)",
                padding: 16,
              }}
            >
              <span
                className="eyebrow"
                style={{ fontWeight: 700, fontSize: 11, color: "var(--text-3)", marginBottom: 8, display: "block" }}
              >
                Recommended Quality Action
              </span>
              <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: "var(--text-2)" }}>
                Initiate a quality investigation and coordinate with production engineering. Perform sample checks at the respective manufacturing lines.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Bar */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            className="btn"
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import Icon from "@/components/editorial/Icon";
import { ThemeSwitcher } from "@/components/editorial/EditorialHeader";

const STEPS = [
  { id: 1, label: "Reading spreadsheets" },
  { id: 2, label: "Extracting data structures" },
  { id: 3, label: "Building analysis context" },
  { id: 4, label: "Running AI analysis" },
  { id: 5, label: "Rendering report" },
];

interface Props {
  activeStep?: number; // 1 to 5
  onComplete?: () => void;
}

export default function ProcessingLoader({ activeStep = 1, onComplete }: Props) {
  // If activeStep goes past STEPS.length, trigger onComplete if available
  useEffect(() => {
    if (activeStep > STEPS.length && onComplete) {
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
  }, [activeStep, onComplete]);

  const activeIndex = Math.max(0, Math.min(activeStep - 1, STEPS.length - 1));
  const currentStep = STEPS[activeIndex];

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg)" }}>
      {/* 1. Sidebar Skeleton */}
      <aside
        style={{
          width: 240,
          height: "100vh",
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderBottom: "1px solid var(--border)",
            height: 56,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "6px",
              background: "var(--accent)",
              opacity: 0.5,
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
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: "-0.02em",
              color: "var(--text)",
              opacity: 0.5,
            }}
          >
            RAIS <span style={{ fontWeight: 500, color: "var(--accent)" }}>Pro</span>
          </span>
        </div>
        <div style={{ padding: "24px 8px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="skeleton-shimmer" style={{ height: 36, width: "90%", borderRadius: "0 8px 8px 0" }} />
          <div className="skeleton-shimmer" style={{ height: 36, width: "75%", borderRadius: "0 8px 8px 0", opacity: 0.6 }} />
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Masthead Skeleton */}
        <header className="masthead">
          <div className="shell-wide">
            <div className="row1">
              <div className="left" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em", color: "var(--text)" }}>
                  Analyzing Report...
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--accent-text)",
                    background: "var(--accent-weak)",
                    padding: "4px 10px",
                    borderRadius: "9999px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      animation: "pulse-ring 1s infinite",
                    }}
                  />
                  Step {activeStep} of 5: {currentStep.label}
                </span>
              </div>
              <div className="right" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div className="skeleton-shimmer" style={{ width: 80, height: 36, borderRadius: "var(--radius-md)" }} />
                <div className="skeleton-shimmer" style={{ width: 120, height: 36, borderRadius: "var(--radius-md)" }} />
                <ThemeSwitcher showLabel />
              </div>
            </div>
            <div className="meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <div className="skeleton-shimmer" style={{ height: 16, width: "30%", borderRadius: "var(--radius-sm)" }} />
              <div className="skeleton-shimmer" style={{ height: 16, width: "15%", borderRadius: "var(--radius-sm)" }} />
            </div>
          </div>
        </header>

        {/* Scrolling Skeleton Body */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: 100 }}>
          {/* Sticky sub-nav skeleton */}
          <div
            style={{
              position: "sticky",
              top: 0,
              background: "var(--bg)",
              borderBottom: "1px solid var(--border)",
              padding: "12px 24px",
              display: "flex",
              gap: 24,
              zIndex: 40,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)", letterSpacing: "0.08em" }}>In this issue</span>
            <div className="skeleton-shimmer" style={{ height: 14, width: 80, borderRadius: "var(--radius-sm)" }} />
            <div className="skeleton-shimmer" style={{ height: 14, width: 90, borderRadius: "var(--radius-sm)" }} />
            <div className="skeleton-shimmer" style={{ height: 14, width: 100, borderRadius: "var(--radius-sm)" }} />
          </div>

          <div className="shell-wide" style={{ paddingTop: 36, paddingBottom: 48, display: "flex", flexDirection: "column", gap: 40 }}>
            {/* 1. Executive Brief Skeleton (AI Surface) */}
            <div
              style={{
                background: "var(--accent-weak)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--pad-card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
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
                <span className="eyebrow accent" style={{ fontWeight: 700, margin: 0 }}>
                  Generating Briefing...
                </span>
              </div>
              <div className="skeleton-shimmer" style={{ height: 28, width: "65%", borderRadius: "var(--radius-sm)", marginBottom: 16 }} />
              <div className="skeleton-shimmer" style={{ height: 16, width: "95%", borderRadius: "var(--radius-sm)", marginBottom: 10 }} />
              <div className="skeleton-shimmer" style={{ height: 16, width: "80%", borderRadius: "var(--radius-sm)", marginBottom: 10 }} />
              <div className="skeleton-shimmer" style={{ height: 16, width: "50%", borderRadius: "var(--radius-sm)" }} />
            </div>

            {/* 2. KPIs Skeleton Grid (3 KPI cards) */}
            <div>
              <div className="skeleton-shimmer" style={{ height: 20, width: "20%", borderRadius: "var(--radius-sm)", marginBottom: 20 }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--gap-grid)" }}>
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-lg)",
                      padding: "var(--pad-card)",
                      minHeight: 140,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                      <div className="skeleton-shimmer" style={{ height: 12, width: "50%", borderRadius: "var(--radius-sm)" }} />
                      <div className="skeleton-shimmer" style={{ height: 16, width: "20%", borderRadius: "var(--radius-sm)" }} />
                    </div>
                    <div className="skeleton-shimmer" style={{ height: 44, width: "60%", borderRadius: "var(--radius-sm)", marginBottom: 16 }} />
                    <div className="skeleton-shimmer" style={{ height: 10, width: "40%", borderRadius: "var(--radius-sm)" }} />
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Charts Skeleton Grid (2 charts) */}
            <div>
              <div className="skeleton-shimmer" style={{ height: 20, width: "20%", borderRadius: "var(--radius-sm)", marginBottom: 20 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-grid)" }}>
                {[1, 2].map((n) => (
                  <div
                    key={n}
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-lg)",
                      padding: "var(--pad-card)",
                      minHeight: 280,
                    }}
                  >
                    <div className="skeleton-shimmer" style={{ height: 16, width: "40%", borderRadius: "var(--radius-sm)", marginBottom: 20 }} />
                    <div className="skeleton-shimmer" style={{ height: 180, width: "100%", borderRadius: "var(--radius-md)" }} />
                  </div>
                ))}
              </div>
            </div>

            {/* 4. AI Observations Skeleton (AI Surface) */}
            <div
              style={{
                background: "var(--accent-weak)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--pad-card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
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
                <span className="eyebrow accent" style={{ fontWeight: 700, margin: 0 }}>
                  Observations & Recommendations
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
                <div>
                  <div className="skeleton-shimmer" style={{ height: 16, width: "45%", borderRadius: "var(--radius-sm)", marginBottom: 20 }} />
                  {[1, 2].map((n) => (
                    <div key={n} style={{ display: "flex", gap: 16, padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
                      <div className="skeleton-shimmer" style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div className="skeleton-shimmer" style={{ height: 12, width: "85%", borderRadius: "var(--radius-sm)" }} />
                        <div className="skeleton-shimmer" style={{ height: 12, width: "55%", borderRadius: "var(--radius-sm)" }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="skeleton-shimmer" style={{ height: 16, width: "45%", borderRadius: "var(--radius-sm)", marginBottom: 20 }} />
                  {[1, 2].map((n) => (
                    <div key={n} style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                      <div className="skeleton-shimmer" style={{ width: 14, height: 14, borderRadius: "2px", flexShrink: 0 }} />
                      <div className="skeleton-shimmer" style={{ height: 12, width: "75%", borderRadius: "var(--radius-sm)", flex: 1 }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

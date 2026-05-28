"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/editorial/Icon";
import Pill from "@/components/editorial/Pill";

const STEPS = [
  { id: 1, label: "Reading spreadsheets",       sub: "Client-side parse · SheetJS" },
  { id: 2, label: "Extracting data structures", sub: "Column inference + type detection" },
  { id: 3, label: "Building analysis context",  sub: "Merge planner · dedupe rollups" },
  { id: 4, label: "Running AI analysis",        sub: "Insight extraction · narrative" },
  { id: 5, label: "Rendering report",           sub: "KPIs · charts · sources" },
];

const DELAYS = [900, 1100, 1300, 2200, 1200];

interface Props {
  onComplete?: () => void;
}

export default function ProcessingLoader({ onComplete }: Props) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (active >= STEPS.length) {
      if (!onComplete) return;
      const t = setTimeout(onComplete, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setActive((a) => Math.min(a + 1, STEPS.length)),
      DELAYS[active] ?? 1000,
    );
    return () => clearTimeout(t);
  }, [active, onComplete]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "40px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 640 }}>
        {/* Spinner */}
        <div
          style={{
            position: "relative",
            width: 96,
            height: 96,
            marginBottom: 36,
          }}
        >
          <svg viewBox="0 0 100 100" width="96" height="96">
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="var(--hairline)"
              strokeWidth="2"
            />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeDasharray="60 200"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 50 50"
                to="360 50 50"
                dur="1.6s"
                repeatCount="indefinite"
              />
            </circle>
            <circle
              cx="50"
              cy="50"
              r="28"
              fill="none"
              stroke="var(--ink)"
              strokeWidth="1"
              strokeDasharray="2 6"
              opacity="0.4"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="360 50 50"
                to="0 50 50"
                dur="6s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx="50" cy="50" r="6" fill="var(--accent)" />
          </svg>
        </div>

        <div className="eyebrow accent">Compiling</div>
        <h1
          className="serif tracked-tight"
          style={{
            fontSize: 48,
            fontWeight: 500,
            margin: "8px 0 6px",
            letterSpacing: "-0.03em",
          }}
        >
          Reading your cycle
          <span className="blink" style={{ color: "var(--accent)" }}>
            _
          </span>
        </h1>
        <p className="muted" style={{ fontSize: 15, marginTop: 0 }}>
          Parsing files · running merge planner · generating narrative
        </p>

        <div
          className="mt-12"
          style={{
            borderLeft: "1px solid var(--hairline-strong)",
            paddingLeft: 28,
          }}
        >
          {STEPS.map((step, i) => {
            const state =
              i < active ? "done" : i === active ? "active" : "pending";
            return (
              <div
                key={step.id}
                style={{
                  position: "relative",
                  paddingBottom: 22,
                  opacity: state === "pending" ? 0.35 : 1,
                  transition: "opacity 0.3s ease",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: -38,
                    top: 2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background:
                      state === "done"
                        ? "var(--ink)"
                        : state === "active"
                          ? "var(--accent)"
                          : "var(--paper-soft)",
                    border: `1.5px solid ${
                      state === "pending"
                        ? "var(--hairline-strong)"
                        : state === "active"
                          ? "var(--accent)"
                          : "var(--ink)"
                    }`,
                    display: "grid",
                    placeItems: "center",
                    color: "var(--paper-soft)",
                  }}
                >
                  {state === "done" && (
                    <Icon name="check" size={11} stroke={3} />
                  )}
                  {state === "active" && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--paper-soft)",
                        animation: "pulse-ring 1s infinite",
                      }}
                    />
                  )}
                </div>
                <div
                  className="flex gap-3"
                  style={{ alignItems: "center" }}
                >
                  <span
                    className="serif"
                    style={{ fontSize: 18, fontWeight: 500 }}
                  >
                    {step.label}
                  </span>
                  {state === "done" && <Pill tone="ink">Done</Pill>}
                  {state === "active" && <Pill tone="accent">Running</Pill>}
                </div>
                <div
                  className="muted mono"
                  style={{ fontSize: 11, marginTop: 4 }}
                >
                  {step.sub}
                  {state === "active" && <span className="blink"> ·</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useTweaks } from "./TweaksContext";
import Icon from "./Icon";
import { BRAND_NAME } from "@/lib/brand";

interface EditorialHeaderProps {
  initials?: string;
  name?: string;
}

export function ThemeSwitcher({ showLabel = false }: { showLabel?: boolean }) {
  const { t, setTweak } = useTweaks();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = t.theme === "dark";

  const toggleTheme = () => {
    setTweak("theme", isDark ? "light" : "dark");
  };

  const themeToDisplay = mounted ? t.theme : "light";
  const displayDark = themeToDisplay === "dark";

  return (
    <button
      onClick={toggleTheme}
      className="btn"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        padding: "8px 12px",
        minHeight: "var(--tap)",
      }}
      title={displayDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle Theme"
    >
      <Icon name={displayDark ? "sun" : "moon"} size={14} stroke={2} />
      {showLabel && (
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          {displayDark ? "Dark" : "Light"}
        </span>
      )}
    </button>
  );
}

/**
 * Editorial masthead for the landing screen. The dashboard uses its own
 * sticky variant (.masthead) — this one is for the upload/landing flow.
 */
export default function EditorialHeader({
  initials = "MI",
  name = "M. Iyer",
}: EditorialHeaderProps) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "16px 0",
        background: "var(--surface)",
      }}
    >
      <div className="shell between">
        <div
          className="flex"
          style={{ alignItems: "baseline", gap: 14, whiteSpace: "nowrap" }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              whiteSpace: "nowrap",
            }}
          >
            {BRAND_NAME}
          </div>
          <div
            className="muted"
            style={{
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              fontWeight: 600,
            }}
          >
            Rejection Analysis Intelligence
          </div>
        </div>
        <div
          className="flex gap-4"
          style={{ alignItems: "center", whiteSpace: "nowrap" }}
        >
          <div className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
            {today}
          </div>
          <ThemeSwitcher />
          <div
            style={{ width: 1, height: 16, background: "var(--border)" }}
          />
          <div className="flex gap-2" style={{ alignItems: "center" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "var(--text-invert)",
                display: "grid",
                placeItems: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {initials}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
          </div>
        </div>
      </div>
    </header>
  );
}


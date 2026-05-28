"use client";

import { useEffect, useState } from "react";
import {
  ACCENT_OPTIONS,
  FONT_OPTIONS,
  useTweaks,
  type Tweaks,
} from "./TweaksContext";

/**
 * Dev-only tweaks panel. Renders nothing in production unless `?tweaks=1`
 * is present in the URL (handy for showing the editorial knobs to a client
 * on a preview deployment).
 */
export default function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const { t, setTweak, reset } = useTweaks();

  useEffect(() => {
    const devMode = process.env.NODE_ENV === "development";
    const flagged =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("tweaks") === "1";
    setEnabled(devMode || flagged);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "." && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!enabled) return null;

  return (
    <>
      {/* Toggle FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle tweaks"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 2147483645,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "var(--ink)",
          color: "var(--paper-soft)",
          fontFamily: "var(--mono)",
          fontSize: 14,
          fontWeight: 600,
          boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
        }}
      >
        ⌘.
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 64,
            zIndex: 2147483646,
            width: 280,
            maxHeight: "calc(100vh - 96px)",
            display: "flex",
            flexDirection: "column",
            background: "rgba(250,249,247,0.92)",
            color: "#29261b",
            backdropFilter: "blur(24px) saturate(160%)",
            WebkitBackdropFilter: "blur(24px) saturate(160%)",
            border: "0.5px solid rgba(0,0,0,0.10)",
            borderRadius: 14,
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.5) inset, 0 12px 40px rgba(0,0,0,0.18)",
            fontFamily: "var(--sans)",
            fontSize: 11.5,
            lineHeight: 1.4,
            overflow: "hidden",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 8px 10px 14px",
              borderBottom: "0.5px solid rgba(0,0,0,0.08)",
            }}
          >
            <strong style={{ fontSize: 12, fontWeight: 600 }}>Tweaks</strong>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={reset}
                title="Reset to defaults"
                style={{
                  fontSize: 10,
                  color: "rgba(41,38,27,0.6)",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
              >
                Reset
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  color: "rgba(41,38,27,0.55)",
                  fontSize: 13,
                }}
              >
                ✕
              </button>
            </div>
          </header>

          <div
            style={{
              padding: "10px 14px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              overflowY: "auto",
            }}
          >
            <Section label="Background">
              <Segmented
                value={t.bg}
                options={["light", "warm", "paper"]}
                onChange={(v) => setTweak("bg", v as Tweaks["bg"])}
              />
            </Section>

            <Section label="Density">
              <Segmented
                value={t.density}
                options={["compact", "comfortable", "spacious"]}
                onChange={(v) => setTweak("density", v as Tweaks["density"])}
              />
            </Section>

            <Section label="Accent">
              <Swatches
                value={t.accent}
                options={ACCENT_OPTIONS}
                onChange={(v) => setTweak("accent", v)}
              />
            </Section>

            <Section label="Heading font">
              <select
                value={t.headingFont}
                onChange={(e) =>
                  setTweak("headingFont", e.target.value as Tweaks["headingFont"])
                }
                style={fieldStyle}
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Section>

            <Section label="Card style">
              <Segmented
                value={t.cardStyle}
                options={["flat", "outlined", "shadow"]}
                onChange={(v) => setTweak("cardStyle", v as Tweaks["cardStyle"])}
              />
            </Section>

            <Section label="Chart style">
              <Segmented
                value={t.chartStyle}
                options={["filled", "outline", "minimal"]}
                onChange={(v) => setTweak("chartStyle", v as Tweaks["chartStyle"])}
              />
            </Section>

            <Section label="Show trace beams">
              <Toggle
                value={t.showBeams}
                onChange={(v) => setTweak("showBeams", v)}
              />
            </Section>
          </div>
        </div>
      )}
    </>
  );
}

const fieldStyle: React.CSSProperties = {
  appearance: "none",
  width: "100%",
  height: 26,
  padding: "0 8px",
  border: "0.5px solid rgba(0,0,0,0.1)",
  borderRadius: 7,
  background: "rgba(255,255,255,0.6)",
  color: "inherit",
  font: "inherit",
  outline: "none",
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "rgba(41,38,27,0.45)",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const idx = Math.max(0, options.indexOf(value));
  const n = options.length;
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        padding: 2,
        borderRadius: 8,
        background: "rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          bottom: 2,
          left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
          width: `calc((100% - 4px) / ${n})`,
          borderRadius: 6,
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
          transition: "left 0.15s cubic-bezier(.3,.7,.4,1)",
        }}
      />
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            minHeight: 22,
            padding: "4px 6px",
            borderRadius: 6,
            fontWeight: 500,
            textTransform: "capitalize",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      style={{
        position: "relative",
        width: 32,
        height: 18,
        borderRadius: 999,
        background: value ? "#34c759" : "rgba(0,0,0,0.15)",
        transition: "background 0.15s",
      }}
    >
      <i
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
          transform: value ? "translateX(14px)" : "none",
          transition: "transform 0.15s",
        }}
      />
    </button>
  );
}

function Swatches({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((c) => {
        const on = c.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c}
            onClick={() => onChange(c)}
            aria-label={c}
            title={c}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 6,
              background: c,
              boxShadow: on
                ? "0 0 0 1.5px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.15)"
                : "0 0 0 .5px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.06)",
            }}
          />
        );
      })}
    </div>
  );
}

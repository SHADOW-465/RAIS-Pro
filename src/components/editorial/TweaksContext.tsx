"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Density = "compact" | "comfortable" | "spacious";
export type Bg = "light" | "warm" | "paper";
export type CardStyle = "flat" | "outlined" | "shadow";
export type ChartStyle = "filled" | "outline" | "minimal";
export type HeadingFont = "Fraunces" | "Newsreader" | "Instrument Serif" | "Playfair Display";

export interface Tweaks {
  density: Density;
  bg: Bg;
  accent: string;
  headingFont: HeadingFont;
  chartStyle: ChartStyle;
  cardStyle: CardStyle;
  showBeams: boolean;
}

export const TWEAK_DEFAULTS: Tweaks = {
  density: "comfortable",
  bg: "warm",
  accent: "#C8421C",
  headingFont: "Fraunces",
  chartStyle: "filled",
  cardStyle: "outlined",
  showBeams: true,
};

export const ACCENT_OPTIONS = ["#C8421C", "#1B4FCC", "#0F7B5A", "#0A0A08"];
export const FONT_OPTIONS: HeadingFont[] = [
  "Fraunces",
  "Newsreader",
  "Instrument Serif",
  "Playfair Display",
];

interface Ctx {
  t: Tweaks;
  setTweak: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  reset: () => void;
}

const TweaksCtx = createContext<Ctx | null>(null);

// Color helpers — port of design's shade/tint
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const v = Math.max(0, Math.min(255, Math.round(x))).toString(16);
        return v.length === 1 ? "0" + v : v;
      })
      .join("")
  );
}
function shade(hex: string, percent: number) {
  const [r, g, b] = hexToRgb(hex);
  const f = percent / 100;
  return rgbToHex(
    r + (f < 0 ? r : 255 - r) * f,
    g + (f < 0 ? g : 255 - g) * f,
    b + (f < 0 ? b : 255 - b) * f,
  );
}
function tint(hex: string, percent: number) {
  const [r, g, b] = hexToRgb(hex);
  const [pr, pg, pb] = [244, 240, 230];
  const t = percent / 100;
  return rgbToHex(r * (1 - t) + pr * t, g * (1 - t) + pg * t, b * (1 - t) + pb * t);
}

export function TweaksProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Tweaks>(TWEAK_DEFAULTS);

  // Apply tweaks to <body> data-attrs + CSS vars
  useEffect(() => {
    const b = document.body;
    b.setAttribute("data-density", t.density);
    b.setAttribute("data-bg", t.bg);
    b.setAttribute("data-card", t.cardStyle);
    b.setAttribute("data-chart-style", t.chartStyle);
    b.style.setProperty("--accent", t.accent);
    b.style.setProperty("--accent-deep", shade(t.accent, -22));
    b.style.setProperty("--accent-soft", tint(t.accent, 78));
    b.style.setProperty("--serif", `'${t.headingFont}', Georgia, serif`);
  }, [t]);

  const setTweak = useCallback(
    <K extends keyof Tweaks>(key: K, value: Tweaks[K]) =>
      setT((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const reset = useCallback(() => setT(TWEAK_DEFAULTS), []);

  const value = useMemo(() => ({ t, setTweak, reset }), [t, setTweak, reset]);
  return <TweaksCtx.Provider value={value}>{children}</TweaksCtx.Provider>;
}

export function useTweaks() {
  const ctx = useContext(TweaksCtx);
  if (!ctx) throw new Error("useTweaks must be used inside <TweaksProvider>");
  return ctx;
}

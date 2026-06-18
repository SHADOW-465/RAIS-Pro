"use client";

import type { SVGProps } from "react";

export type IconName =
  | "upload" | "file" | "x" | "check" | "arrow-right" | "arrow-left"
  | "send" | "save" | "split" | "search" | "chevron-down" | "chevron-up"
  | "alert" | "trend-up" | "trend-down" | "minus" | "plus" | "spark"
  | "table" | "external" | "dot" | "lightning" | "tally" | "print"
  | "sun" | "moon" | "comment";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "stroke"> {
  name: IconName;
  size?: number;
  stroke?: number;
}

export default function Icon({ name, size = 16, stroke = 1.6, ...rest }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    ...rest,
  };
  switch (name) {
    case "upload":      return <svg {...common}><path d="M12 3v12" /><path d="M7 8l5-5 5 5" /><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" /></svg>;
    case "file":        return <svg {...common}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></svg>;
    case "x":           return <svg {...common}><path d="M6 6l12 12M6 18L18 6" /></svg>;
    case "check":       return <svg {...common}><path d="M4 12l5 5L20 6" /></svg>;
    case "arrow-right": return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "arrow-left":  return <svg {...common}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
    case "send":        return <svg {...common}><path d="M3 12l18-9-7 18-2-7-9-2z" /></svg>;
    case "save":        return <svg {...common}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></svg>;
    case "split":       return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M12 3v18" /></svg>;
    case "search":      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "chevron-down":return <svg {...common}><path d="M6 9l6 6 6-6" /></svg>;
    case "chevron-up":  return <svg {...common}><path d="M18 15l-6-6-6 6" /></svg>;
    case "alert":       return <svg {...common}><path d="M12 2L1 21h22L12 2z" /><path d="M12 9v5M12 18h.01" /></svg>;
    case "trend-up":    return <svg {...common}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>;
    case "trend-down":  return <svg {...common}><path d="M3 7l6 6 4-4 8 8" /><path d="M14 17h7v-7" /></svg>;
    case "minus":       return <svg {...common}><path d="M5 12h14" /></svg>;
    case "plus":        return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "spark":       return <svg {...common}><path d="M12 3v3M21 12h-3M12 21v-3M3 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>;
    case "table":       return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>;
    case "external":    return <svg {...common}><path d="M14 3h7v7" /><path d="M10 14L21 3" /><path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h10" /></svg>;
    case "dot":         return <svg {...common}><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></svg>;
    case "lightning":   return <svg {...common}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>;
    case "tally":       return <svg {...common}><path d="M5 5v14M9 5v14M13 5v14M17 5v14M3 12l18-2" /></svg>;
    case "print":       return <svg {...common}><path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z" /></svg>;
    case "sun":         return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>;
    case "moon":        return <svg {...common}><path d="M12 3a9 9 0 109 9 9.75 9.75 0 00-9-9z" /></svg>;
    case "comment":     return <svg {...common}><path d="M21 11.5a8.38 8.38 0 01-8.5 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 01-.9-3.8 8.38 8.38 0 018.5-8.5 8.38 8.38 0 018.5 8.5z" /></svg>;
    default: return null;
  }
}

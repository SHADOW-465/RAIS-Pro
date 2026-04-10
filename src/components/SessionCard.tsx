// src/components/SessionCard.tsx
"use client";

import { motion } from "framer-motion";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;      // ISO string
  fileNames: string[];
  slideCount: number;
  kpiPreview: Array<{ label: string; value: string | number }>;
}

interface SessionCardProps {
  session: SessionSummary;
  isActive?: boolean;
  onClick: () => void;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SessionCard({ session, isActive, onClick }: SessionCardProps) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      onClick={onClick}
      className={`cursor-pointer p-4 ${isActive ? "glass-tinted" : "glass-card"}`}
    >
      {/* Date */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1.5">
        {relativeDate(session.createdAt)}
      </p>

      {/* Title */}
      <h3 className="text-sm font-bold text-text-primary leading-snug mb-1">
        {session.title}
      </h3>

      {/* File names */}
      <p className="text-[11px] text-text-muted mb-3 truncate">
        {session.fileNames.join(" · ")}
      </p>

      {/* KPI preview */}
      <div className="flex gap-2 mb-3">
        {session.kpiPreview.slice(0, 2).map((kpi, i) => (
          <div
            key={i}
            className="flex-1 bg-white/60 rounded-lg px-2.5 py-2"
          >
            <p className="text-[8px] uppercase tracking-wider text-text-muted">{kpi.label}</p>
            <p className="text-sm font-bold text-text-primary">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-accent bg-accent/8 rounded-full px-2.5 py-1">
          ◈ {session.slideCount} insight {session.slideCount === 1 ? "slide" : "slides"}
        </span>
        <span className="text-[11px] font-semibold text-accent">Open →</span>
      </div>
    </motion.div>
  );
}

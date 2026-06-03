// src/components/SessionCard.tsx
"use client";

import Icon from "@/components/editorial/Icon";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
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
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SessionCard({ session, onClick }: SessionCardProps) {
  // We don't know the actual trend without more data; default to neutral.
  const trendColor = "var(--text-3)";
  const trendArrow = "→";

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      tabIndex={0}
      role="button"
      className="recent-card card-hover"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
        cursor: "pointer",
        position: "relative",
      }}
    >
      <div
        className="between"
        style={{ alignItems: "flex-start", marginBottom: 12 }}
      >
        <div className="eyebrow" style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700 }}>
          {relativeDate(session.createdAt)}
        </div>
        <span
          style={{
            color: trendColor,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {trendArrow}
        </span>
      </div>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 17,
          margin: 0,
          fontWeight: 800,
          letterSpacing: "-0.01em",
          lineHeight: 1.25,
          color: "var(--text)",
          minHeight: 41,
        }}
      >
        {session.title}
      </h3>
      <div
        className="flex gap-4 mt-4 num"
        style={{ fontSize: 11, color: "var(--text-3)" }}
      >
        <span>
          <strong style={{ color: "var(--text)" }}>
            {session.fileNames.length}
          </strong>{" "}
          file{session.fileNames.length === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span>
          <strong style={{ color: "var(--text)" }}>
            {session.kpiPreview.length}
          </strong>{" "}
          kpis
        </span>
        <span>·</span>
        <span>
          <strong style={{ color: "var(--text)" }}>
            {session.slideCount}
          </strong>{" "}
          slides
        </span>
      </div>
      <div
        className="recent-arrow"
        style={{
          position: "absolute",
          right: 14,
          bottom: 14,
          opacity: 0,
          transition: "opacity 0.2s ease, transform 0.2s ease",
        }}
      >
        <Icon name="arrow-right" size={16} style={{ color: "var(--accent)" }} />
      </div>
    </div>
  );
}

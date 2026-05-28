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
  const trendColor = "var(--muted)";
  const trendArrow = "→";

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      tabIndex={0}
      role="button"
      className="recent-card"
      style={{
        background: "var(--paper-soft)",
        border: "1px solid var(--hairline)",
        padding: 18,
        cursor: "pointer",
        position: "relative",
      }}
    >
      <div
        className="between"
        style={{ alignItems: "flex-start", marginBottom: 12 }}
      >
        <div className="eyebrow muted" style={{ fontSize: 10 }}>
          {relativeDate(session.createdAt)}
        </div>
        <span
          style={{
            color: trendColor,
            fontFamily: "var(--mono)",
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {trendArrow}
        </span>
      </div>
      <h3
        className="serif"
        style={{
          fontSize: 17,
          margin: 0,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          lineHeight: 1.2,
          minHeight: 41,
        }}
      >
        {session.title}
      </h3>
      <div
        className="flex gap-4 mt-4 mono"
        style={{ fontSize: 11, color: "var(--muted)" }}
      >
        <span>
          <strong style={{ color: "var(--ink)" }}>
            {session.fileNames.length}
          </strong>{" "}
          file{session.fileNames.length === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span>
          <strong style={{ color: "var(--ink)" }}>
            {session.kpiPreview.length}
          </strong>{" "}
          kpis
        </span>
        <span>·</span>
        <span>
          <strong style={{ color: "var(--ink)" }}>
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
        <Icon name="arrow-right" size={16} />
      </div>
    </div>
  );
}

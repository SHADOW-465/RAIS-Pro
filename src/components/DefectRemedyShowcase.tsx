"use client";

import { RANK_WORDS, isRemedyComplete, lookupRemedy, useRemedyBook } from "@/lib/remedy-store";

export default function DefectRemedyShowcase({
  ranked,
  compact = false,
}: {
  ranked: { code: string; label: string }[];
  compact?: boolean;
}) {
  const book = useRemedyBook();
  const top = ranked.slice(0, 3);
  if (top.length === 0) return null;

  const missing = top.filter((d) => !isRemedyComplete(lookupRemedy(book, d.code) ?? lookupRemedy(book, d.label)));

  return (
    <div
      style={{
        marginTop: compact ? 0 : 12,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        background: "var(--surface)",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: "var(--surface-2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          Primary · Secondary · Tertiary remedies
        </span>
        <a
          href="/actions/remedies"
          style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-text)", textDecoration: "none" }}
        >
          Manage remedies →
        </a>
      </div>
      {missing.length > 0 && (
        <p
          style={{
            margin: 0,
            padding: "8px 14px",
            fontSize: 12.5,
            color: "var(--warning)",
            background: "var(--warning-weak)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          Feed description and remedy for {missing.map((d) => d.code).join(", ")} on the Remedies page before this showcase is complete.
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {top.map((d, i) => {
          const rec = lookupRemedy(book, d.code) ?? lookupRemedy(book, d.label);
          const ready = isRemedyComplete(rec);
          return (
            <div
              key={d.code}
              style={{
                padding: "12px 14px",
                borderRight: "1px solid var(--border)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--accent)",
                  marginBottom: 4,
                }}
              >
                {RANK_WORDS[i]} defect
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  fontSize: 15,
                  color: "var(--text)",
                }}
              >
                {d.code}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 8 }}>{d.label}</div>
              {ready ? (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: 12.5, lineHeight: 1.5, color: "var(--text)" }}>
                    {rec!.description}
                  </p>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--text-2)" }}>
                    <strong style={{ color: "var(--text)" }}>Remedy. </strong>
                    {rec!.remedy}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-3)", lineHeight: 1.45 }}>
                  No description and remedy fed yet.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

interface PageLoaderProps {
  message?: string;
  minHeight?: string | number;
}

export default function PageLoader({ message = "Loading intelligence ledger...", minHeight = "50vh" }: PageLoaderProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight,
      width: "100%",
      padding: 24,
    }}>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        padding: "36px 48px",
        boxShadow: "var(--shadow-3)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        position: "relative",
        overflow: "hidden",
        maxWidth: 380,
        width: "100%",
      }}>
        {/* Shimmer top-accent bar */}
        <div className="skeleton-shimmer" style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          opacity: 0.8
        }} />

        {/* Shifter/Glower ring */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: 72, width: 72 }}>
          <div className="spinner-outer" />
          <div className="spinner-inner" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {message && (
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--text)",
              letterSpacing: "0.02em",
              textAlign: "center"
            }}>
              {message}
            </div>
          )}
          <div className="muted" style={{ fontSize: 10, fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Operational Diagnostics Live
          </div>
        </div>

        {/* Shifting data visualizer bars */}
        <div style={{ display: "flex", gap: 5, height: 20, alignItems: "center" }}>
          <div className="loader-bar" />
          <div className="loader-bar" />
          <div className="loader-bar" />
          <div className="loader-bar" />
          <div className="loader-bar" />
        </div>
      </div>
    </div>
  );
}

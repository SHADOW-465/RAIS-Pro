"use client";
"use client";

interface PageLoaderProps {
  message?: string;
  minHeight?: string | number;
}

export default function PageLoader({ message, minHeight = "100vh" }: PageLoaderProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", padding: "var(--space-5)", minHeight, width: "100%" }}>
      {/* Header Skeleton */}
      <div className="fade-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "var(--space-3)", animationDelay: "0ms" }}>
        <div>
          <div className="skeleton-shimmer" style={{ width: 140, height: 14, borderRadius: 4, marginBottom: 12 }} />
          <div className="skeleton-shimmer" style={{ width: 280, height: 32, borderRadius: 8 }} />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="skeleton-shimmer" style={{ width: 220, height: 36, borderRadius: 8 }} />
        </div>
      </div>
      
      {/* KPI Row Skeleton */}
      <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-5)", animationDelay: "80ms" }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)", padding: 20, height: 130, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div className="skeleton-shimmer" style={{ width: 80, height: 12, borderRadius: 4 }} />
            <div className="skeleton-shimmer" style={{ width: 120, height: 32, borderRadius: 6, margin: "12px 0" }} />
            <div className="skeleton-shimmer" style={{ width: 160, height: 12, borderRadius: 4 }} />
          </div>
        ))}
      </div>

      {/* Charts Row Skeleton */}
      <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "var(--space-5)", flex: 1, minHeight: 400, animationDelay: "160ms" }}>
        <div style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)", padding: 24, display: "flex", flexDirection: "column" }}>
          <div className="skeleton-shimmer" style={{ width: 120, height: 16, borderRadius: 4, marginBottom: 24 }} />
          <div className="skeleton-shimmer" style={{ flex: 1, borderRadius: 8, opacity: 0.5 }} />
        </div>
        <div style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius-lg)", background: "var(--surface)", padding: 24, display: "flex", flexDirection: "column" }}>
          <div className="skeleton-shimmer" style={{ width: 100, height: 16, borderRadius: 4, marginBottom: 24 }} />
          <div className="skeleton-shimmer" style={{ flex: 1, borderRadius: 8, opacity: 0.5 }} />
        </div>
      </div>
    </div>
  );
}

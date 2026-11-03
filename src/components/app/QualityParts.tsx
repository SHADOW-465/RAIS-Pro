"use client";

import { KpiTile, PrimaryAction, type KpiTileProps } from "@/components/ui/primitives";

/** L1 of every Quality tab: up to 3 numbers and the tab's one primary action. */
export function QualityHeader({
  tiles, actionLabel, onAction,
}: { tiles: KpiTileProps[]; actionLabel?: string; onAction?: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: "var(--gap-grid)", flexWrap: "wrap" }}>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--gap-grid)" }}>
        {tiles.map((t) => <KpiTile key={t.label} {...t} />)}
      </div>
      {actionLabel && onAction && (
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <PrimaryAction onClick={onAction}>{actionLabel}</PrimaryAction>
        </div>
      )}
    </div>
  );
}

/** Neutral two/three-way toggle (qty vs rate, share vs contribution). Selection = weight + surface, no accent. */
export function SegmentedControl<T extends string>({
  value, options, onChange, label,
}: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: "inline-flex", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 2, gap: 2 }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          style={{
            minHeight: 28, padding: "0 12px", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer",
            background: value === o.id ? "var(--surface)" : "transparent",
            boxShadow: value === o.id ? "0 0 0 1px var(--border-strong)" : "none",
            color: value === o.id ? "var(--text)" : "var(--text-3)",
            fontFamily: "inherit", fontSize: "var(--text-sm)", fontWeight: value === o.id ? 600 : 400,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Per-series "Batches" / "History" shortcuts into the detail panel. Neutral, no emoji. */
export function DrillLinks({
  name, onBatches, onHistory,
}: { name: string; onBatches: () => void; onHistory: () => void }) {
  const style: React.CSSProperties = {
    minHeight: 24, padding: "0 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
    background: "var(--surface)", color: "var(--text-2)", fontFamily: "inherit", fontSize: "var(--text-sm)",
    fontWeight: 500, cursor: "pointer",
  };
  return (
    <>
      <button type="button" aria-label={`Show batch IDs for ${name}`} style={style}
        onClick={(e) => { e.stopPropagation(); onBatches(); }}>Batches</button>
      <button type="button" aria-label={`Show Data Entry history for ${name}`} style={style}
        onClick={(e) => { e.stopPropagation(); onHistory(); }}>History</button>
    </>
  );
}

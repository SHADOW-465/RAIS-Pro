"use client";

/**
 * BatchIdChip
 *
 * Renders a batch ID in monospace with two hover-revealed actions:
 *   • Copy  — copies the raw batch ID to clipboard
 *   • DE    — navigates to Data Entry pre-filled for this lot
 *
 * Drop into the batch-ID column of History and Audit rows.
 */

import React, { useState, useCallback, useMemo } from "react";
import { parseBatchId } from "@/lib/entry/batch-id";
import { sizeColorFor } from "@/lib/entry/size-color";

interface BatchIdChipProps {
  batchId: string;
  /** Override display label (e.g. batchLabel transforms). Defaults to batchId. */
  label?: string;
  /** Suffix node rendered after the ID (e.g. ⚠ for inconsistent figures). */
  warnSuffix?: React.ReactNode;
  /** Extra styles for the outer wrapper span. */
  style?: React.CSSProperties;
  /** Whether to show the DE (Data Entry) shortcut action button. Defaults to true. */
  showDataEntry?: boolean;
}

export default function BatchIdChip({
  batchId,
  label,
  warnSuffix,
  style,
  showDataEntry = true,
}: BatchIdChipProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  // DS/ANX/05 balloon-capacity color code, keyed off the size encoded in the
  // batch id itself (e.g. "26I25-14" → 14Fr → Green) — see size-color.ts.
  const sizeFr = useMemo(() => parseBatchId(batchId)?.sizeFr, [batchId]);
  const swatch = useMemo(() => (sizeFr ? sizeColorFor(sizeFr) : null), [sizeFr]);

  const handleCopy = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      void navigator.clipboard.writeText(batchId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    },
    [batchId],
  );

  const dataEntryHref = `/data-entry?batch=${encodeURIComponent(batchId)}`;

  const handleOpenEntry = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      window.location.href = dataEntryHref;
    },
    [dataEntryHref],
  );

  const btnBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: 22,
    borderRadius: "var(--radius-sm, 5px)",
    border: "1px solid var(--border-strong)",
    background: "var(--surface-3, var(--surface-2))",
    cursor: "pointer",
    padding: "0 7px",
    fontSize: 11,
    fontFamily: "var(--font-sans)",
    fontWeight: 600,
    lineHeight: 1,
    transition: "all 0.12s var(--ease-out)",
    whiteSpace: "nowrap",
    textDecoration: "none",
    flexShrink: 0,
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        position: "relative",
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setCopied(false);
      }}
    >
      {/* Batch ID text, highlighted with its DS/ANX/05 size color code.
          The highlight is a background tint offset by a matching negative
          margin, so it costs zero extra layout width — this cell already
          sits at its flex-shrink floor (hover actions + hairline space),
          and a same-row sibling swatch previously collapsed the id to 0px. */}
      <span
        title={swatch ? `${swatch.name} (${sizeFr}Fr) — DS/ANX/05 size color code` : undefined}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-md)",
          fontWeight: 700,
          letterSpacing: "0.03em",
          color: "var(--text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          ...(swatch && {
            background: `color-mix(in srgb, ${swatch.hex} 35%, transparent)`,
            borderRadius: 4,
            padding: "1px 4px",
            margin: "-1px -4px",
            boxShadow:
              swatch.hex === "#FFFFFF" ? "inset 0 0 0 1px var(--border-strong)" : undefined,
          }),
        }}
      >
        {label ?? batchId}
      </span>

      {warnSuffix}

      {/* Hover actions */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? "auto" : "none",
          transition: "opacity 0.15s var(--ease-out)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Copy button — span, not button, because this lives inside a <button> row toggle */}
        <span
          role="button"
          tabIndex={0}
          title={copied ? "Copied!" : `Copy ${batchId}`}
          onClick={handleCopy}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCopy(e); }}
          style={{
            ...btnBase,
            color: copied ? "var(--positive)" : "var(--text-2)",
            borderColor: copied
              ? "color-mix(in srgb, var(--positive) 50%, var(--border))"
              : "var(--border-strong)",
            background: copied
              ? "color-mix(in srgb, var(--positive) 10%, var(--surface-3, var(--surface-2)))"
              : "var(--surface-3, var(--surface-2))",
          }}
          aria-label={copied ? "Copied!" : `Copy batch ID ${batchId}`}
        >
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="4" y="1" width="6" height="9" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <path d="M4 3H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          )}
        </span>

        {/* Open in Data Entry — span role="link", not <a>, to avoid nested interactive content */}
        {showDataEntry && (
          <span
            role="link"
            tabIndex={0}
            title={`Open ${batchId} in Data Entry`}
            onClick={handleOpenEntry}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleOpenEntry(e); }}
            style={{
              ...btnBase,
              color: "var(--accent)",
              borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))",
              background: "color-mix(in srgb, var(--accent) 10%, var(--surface-3, var(--surface-2)))",
              gap: 4,
            }}
            aria-label={`Open ${batchId} in Data Entry`}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M5.5 1H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M7 1h3v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 1L5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            DE
          </span>
        )}
      </span>
    </span>
  );
}

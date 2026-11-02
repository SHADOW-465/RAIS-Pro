"use client";

/**
 * BatchIdChip
 *
 * Renders a batch ID in monospace with two hover-revealed actions:
 *   • Copy  — copies the raw batch ID to clipboard
 *   • DE    — navigates to Data Entry pre-filled for this lot
 *
 * Supports both OK batch ("26J16-24") and Convert batch ("26J16-24 CT 22").
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { parseBatchId } from "@/lib/entry/batch-id";
import { sizeColorFor } from "@/lib/entry/size-color";

interface BatchIdChipProps {
  batchId: string;
  /** Override display label (e.g. "26J16-24 CT 22" for Convert batch). Defaults to batchId. */
  label?: string;
  /** Suffix node rendered after the ID (e.g. ⚠ for inconsistent figures). */
  warnSuffix?: React.ReactNode;
  /** Extra styles for the outer wrapper span. */
  style?: React.CSSProperties;
  /** Whether to show the DE (Data Entry) shortcut action button. Defaults to true. */
  showDataEntry?: boolean;
  /** Optional Batch Conversion shortcut (original or converted identity). */
  conversionHref?: string | null;
}

export default function BatchIdChip({
  batchId,
  label,
  warnSuffix,
  style,
  showDataEntry = true,
  conversionHref = null,
}: BatchIdChipProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const displayText = label ?? batchId;

  // Clear pending hide timer on unmount
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = setTimeout(() => {
      setHovered(false);
      setCopied(false);
      leaveTimerRef.current = null;
    }, 220);
  }, []);

  // Detect Convert batch nomenclature: "26J16-24 CT 22" (Year Month Day - mainsize CT Convert size)
  const ctParts = useMemo(() => {
    const m = displayText.match(/^([0-9]{2}[A-L][0-9]{2}-[0-9]{1,2})\s+CT\s+([0-9]{1,2}|[0-9]{2}[A-L][0-9]{2}-[0-9]{1,2})$/i);
    if (!m) return null;
    const mainCode = m[1].toUpperCase();
    const rightRaw = m[2].toUpperCase();
    const mainSizeFr = parseBatchId(mainCode)?.sizeFr ?? mainCode.split("-")[1] ?? "";
    const convSizeFr = parseBatchId(rightRaw)?.sizeFr ?? rightRaw;
    return {
      mainCode,
      mainSizeFr,
      convSizeFr,
      mainSwatch: mainSizeFr ? sizeColorFor(mainSizeFr) : null,
      convSwatch: convSizeFr ? sizeColorFor(convSizeFr) : null,
    };
  }, [displayText]);

  // DS/ANX/05 balloon-capacity color code, keyed off the size encoded in the
  // batch id itself (e.g. "26I25-14" → 14Fr → Green) — see size-color.ts.
  const sizeFr = useMemo(() => parseBatchId(batchId)?.sizeFr, [batchId]);
  const swatch = useMemo(() => (sizeFr ? sizeColorFor(sizeFr) : null), [sizeFr]);

  const handleCopy = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      void navigator.clipboard.writeText(displayText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [displayText],
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

  const resolvedConversionHref =
    conversionHref ??
    (ctParts ? `/batch-conversion?batch=${encodeURIComponent(ctParts.mainCode)}` : null);

  const handleOpenConversion = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (resolvedConversionHref) window.location.href = resolvedConversionHref;
    },
    [resolvedConversionHref],
  );

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        position: "relative",
        minWidth: 0,
        zIndex: hovered ? 120 : "auto",
        ...style,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {ctParts ? (
        <span
          title={`Convert batch: ${ctParts.mainCode} (main size ${ctParts.mainSizeFr}Fr) → CT ${ctParts.convSizeFr} (convert size ${ctParts.convSizeFr}Fr)`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-md)",
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: "var(--text)",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              ...(ctParts.mainSwatch && {
                background: `color-mix(in srgb, ${ctParts.mainSwatch.hex} 32%, transparent)`,
                borderRadius: 4,
                padding: "1px 4px",
                boxShadow:
                  ctParts.mainSwatch.hex === "#FFFFFF"
                    ? "inset 0 0 0 1px var(--border-strong)"
                    : undefined,
              }),
            }}
          >
            {ctParts.mainCode}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 5px",
              borderRadius: 4,
              background: "color-mix(in srgb, var(--accent) 18%, var(--surface-2))",
              color: "var(--accent)",
              border: "1px solid color-mix(in srgb, var(--accent) 45%, var(--border))",
              letterSpacing: "0.04em",
            }}
          >
            CT
          </span>
          <span
            style={{
              padding: "1px 5px",
              borderRadius: 4,
              background: ctParts.convSwatch
                ? `color-mix(in srgb, ${ctParts.convSwatch.hex} 35%, transparent)`
                : "var(--surface-2)",
              boxShadow:
                ctParts.convSwatch?.hex === "#FFFFFF"
                  ? "inset 0 0 0 1px var(--border-strong)"
                  : undefined,
            }}
          >
            {ctParts.convSizeFr}
          </span>
        </span>
      ) : (
        <span
          title={swatch ? `${swatch.name} (${sizeFr}Fr) — DS/ANX/05 size color code` : undefined}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-md)",
            fontWeight: 600,
            letterSpacing: "0.03em",
            color: "var(--text)",
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
          {displayText}
        </span>
      )}

      {warnSuffix}

      {/* Floating Shortcut Menu — anchored below the batch ID with high clarity, never overflowing or deforming cards */}
      {hovered && (
        <div
          role="menu"
          aria-label={`Shortcut actions for ${displayText}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="fade-up"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 300,
            minWidth: 175,
            maxWidth: 240,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.65), 0 2px 8px rgba(0, 0, 0, 0.4)",
            padding: 5,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pointerEvents: "auto",
            textAlign: "left",
          }}
        >
          {/* Popover Arrow Caret */}
          <div
            style={{
              position: "absolute",
              top: -5,
              left: 14,
              width: 8,
              height: 8,
              background: "var(--surface)",
              borderLeft: "1px solid var(--border-strong)",
              borderTop: "1px solid var(--border-strong)",
              transform: "rotate(45deg)",
              pointerEvents: "none",
            }}
          />

          {/* Title Row */}
          <div
            style={{
              padding: "4px 8px 5px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--text-3)",
            }}
          >
            <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 9 }}>
              Batch Menu
            </span>
            <span
              style={{
                fontWeight: 600,
                color: "var(--text-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 110,
              }}
              title={displayText}
            >
              {displayText}
            </span>
          </div>

          {/* Action: Copy */}
          <div
            role="menuitem"
            tabIndex={0}
            title={copied ? "Copied to clipboard!" : `Copy “${displayText}”`}
            onClick={handleCopy}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") handleCopy(e);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "6px 8px",
              borderRadius: 6,
              cursor: "pointer",
              background: copied
                ? "color-mix(in srgb, var(--positive) 16%, var(--surface-2))"
                : "transparent",
              color: copied ? "var(--positive)" : "var(--text)",
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: "var(--font-sans)",
              transition: "background 0.12s ease, color 0.12s ease",
            }}
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.background = "var(--surface-2)";
                e.currentTarget.style.color = "var(--text)";
              }
            }}
            onMouseLeave={(e) => {
              if (!copied) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text)";
              }
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {copied ? (
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="var(--positive)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                  <rect x="4" y="1" width="6" height="9" rx="1" stroke="currentColor" strokeWidth="1.3" />
                  <path
                    d="M4 3H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V9"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              <span>{copied ? "Copied!" : "Copy Batch ID"}</span>
            </div>
            <span
              style={{
                fontSize: 9.5,
                fontFamily: "var(--font-mono)",
                color: copied ? "var(--positive)" : "var(--text-3)",
                fontWeight: 600,
              }}
            >
              {copied ? "✓" : "Copy"}
            </span>
          </div>

          {/* Action: Data Entry (DE) */}
          {showDataEntry && (
            <div
              role="menuitem"
              tabIndex={0}
              title={`Open ${batchId} in Data Entry`}
              onClick={handleOpenEntry}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleOpenEntry(e);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                cursor: "pointer",
                background: "transparent",
                color: "var(--text)",
                fontSize: 11.5,
                fontWeight: 600,
                fontFamily: "var(--font-sans)",
                transition: "background 0.12s ease, color 0.12s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "color-mix(in srgb, var(--accent) 14%, var(--surface-2))";
                e.currentTarget.style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <svg width="13" height="13" viewBox="0 0 11 11" fill="none">
                  <path
                    d="M5.5 1H2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                  <path
                    d="M7 1h3v3"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M10 1L5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span>Data Entry (DE)</span>
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: "color-mix(in srgb, var(--accent) 18%, var(--surface-2))",
                  color: "var(--accent)",
                }}
              >
                DE ↗
              </span>
            </div>
          )}

          {/* Action: Batch Conversion (CT) */}
          {resolvedConversionHref && (
            <div
              role="menuitem"
              tabIndex={0}
              title={`Open ${batchId} in Batch Conversion`}
              onClick={handleOpenConversion}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleOpenConversion(e);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                cursor: "pointer",
                background: "transparent",
                color: "var(--text)",
                fontSize: 11.5,
                fontWeight: 600,
                fontFamily: "var(--font-sans)",
                transition: "background 0.12s ease, color 0.12s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "color-mix(in srgb, var(--accent) 14%, var(--surface-2))";
                e.currentTarget.style.color = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text)";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 4h9m0 0L8.5 1.5M11 4L8.5 6.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 10H3m0 0l2.5 2.5M3 10l2.5-2.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Batch Conversion</span>
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: "color-mix(in srgb, var(--accent) 18%, var(--surface-2))",
                  color: "var(--accent)",
                }}
              >
                CT ⇄
              </span>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

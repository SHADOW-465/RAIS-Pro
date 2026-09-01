"use client";

// Lot identity, composed from the day the lot STARTED.
//
// The bug this replaces: the batch code was rebuilt from "Recorded on", the day
// the current station ran the lot. A lot spans several days on the floor, so
// setting Recorded on to tomorrow silently renamed the lot. The previous
// guard was a `batchManual` flag flipped by typing or entering a quantity —
// interaction-based, so an operator who simply moved the date first still lost
// the code.
//
// The fix is structural, not another guard: the code is composed from its own
// `batchDate`, which nothing else writes. Recorded on cannot reach it.
//
//   Batch date  →  26F27-14        (lot identity, set here)
//   Recorded on →  ledger event date only

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import DatePicker from "@/components/ui/DatePicker";
import {
  buildBatchId,
  canonicalBatchId,
  formatBatchIdInput,
  parseBatchId,
  MONTH_NAMES,
} from "@/lib/entry/batch-id";

const today = () => new Date().toISOString().slice(0, 10);

/** "Aug" — the full month name was the widest cell and what forced the wrap. */
function shortMonth(monthIndex: number): string {
  return new Date(Date.UTC(2000, monthIndex, 1)).toLocaleString("en", {
    month: "short",
    timeZone: "UTC",
  });
}

/** "5 Aug" — day and month only, for the second date on a one-line summary. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })}`;
}

function prettyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${d.toLocaleString("en", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

export default function BatchIdField({
  batchId,
  onBatchIdChange,
  batchDate,
  onBatchDateChange,
  size,
  disabled = false,
  recordedOn,
}: {
  batchId: string;
  onBatchIdChange: (raw: string) => void;
  /** ISO day the lot was started. The only input to the date part of the code. */
  batchDate: string;
  onBatchDateChange: (iso: string) => void;
  size: string;
  disabled?: boolean;
  /** Shown only to contrast the two dates when they differ. */
  recordedOn: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);


  const parsed = parseBatchId(batchId);
  // Non-null only when what the operator typed differs from what gets stored.
  const canonical = canonicalBatchId(batchId);
  const filedAs =
    canonical && canonical !== batchId.trim().toUpperCase() ? canonical : null;
  const preview = buildBatchId(batchDate, size);
  const spansDays = recordedOn !== batchDate;

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 296)),
      top: r.bottom + 6,
      width: r.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const on = () => place();
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      // Portaled DatePicker calendars live on document.body. Treat them as
      // inside this panel so picking a day can write the lot code.
      if (t instanceof Element && t.closest("[data-moid-datepicker]")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Row 1: the code and its one action, side by side. Keeping the action
          on this row is what stops it orphaning onto a line of its own. */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
        <input
          value={batchId}
          onChange={(e) => onBatchIdChange(e.target.value)}
          disabled={disabled}
          maxLength={10}
          placeholder="26F27-14"
          aria-label="Batch or lot ID"
          title="Lot identity. Type it, or set the lot date. It never changes when Recorded on moves."
          style={{
            flex: 1,
            minWidth: 0,
            padding: "8px 10px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-strong)",
            background: "var(--surface)",
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            // Ink, not accent. This is data, and Audit and History already
            // render batch ids in ink — three accent-coloured things stacked in
            // one column left nothing for the real action to stand out against.
            color: "var(--text)",
            boxSizing: "border-box",
          }}
        />
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="Change lot date"
          style={{
            flexShrink: 0,
            padding: "0 10px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${open ? "var(--accent)" : "var(--border)"}`,
            background: open ? "var(--accent-weak)" : "transparent",
            // The only accent in the block, so it reads as the one thing to click.
            color: "var(--accent-text)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
            transition:
              "background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
          }}
        >
          Change
        </button>
      </div>

      {/* Row 2: how the code is composed. A fixed four-column grid, not a
          wrapping row of pills — the pills reflowed onto two lines in this
          narrow column and the whole block read as congested. The grid always
          holds one line and the values stay in aligned columns. */}
      {parsed ? (
        <div
          style={{
            marginTop: 8,
            display: "grid",
            // Yr / Mo / Day size to their content; Sz takes the remainder,
            // because "14 FR" is wider than the other three and equal columns
            // clipped it.
            gridTemplateColumns: "repeat(3, auto) minmax(0, 1fr)",
            gap: "0 6px",
            padding: "6px 8px",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <Part label="Yr" value={parsed.year2} mono />
          <Part label="Mo" value={shortMonth(parsed.monthIndex)} />
          <Part label="Day" value={parsed.day} mono />
          <Part
            label="Sz"
            value={parsed.sizeFr ? `${parsed.sizeFr} FR` : "—"}
            mono
            muted={!parsed.sizeFr}
          />
        </div>
      ) : (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "var(--text-xs)",
            color: "var(--warning)",
            lineHeight: 1.45,
          }}
        >
          {batchId.trim()
            ? "Not a full lot code yet — it needs a size, like 26F27-14"
            : "No lot set"}
        </p>
      )}

      {/* Says what will actually be stored, before it is stored.
          `26G01-06` and `26G01-6` are one physical lot; filing them apart is
          what made a finished lot read "3/4 Stalled" with its Final gate
          sitting under the twin. Stated as a fact, not an error — the fold is
          automatic and nothing is lost. */}
      {filedAs && (
        <p
          style={{
            margin: "6px 0 0",
            padding: "5px 8px",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            fontSize: "var(--text-2xs)",
            color: "var(--text-2)",
            lineHeight: 1.45,
          }}
        >
          Saved as{" "}
          <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{filedAs}</strong>{" "}
          so this stays one lot. A size never keeps a leading zero.
        </p>
      )}

      {/* Only when the two dates actually differ. On a same-day entry this
          would be restating the grid above it. */}
      {spansDays && parsed && (
        <p
          style={{
            margin: "5px 0 0",
            fontSize: "var(--text-2xs)",
            color: "var(--text-3)",
            lineHeight: 1.45,
          }}
        >
          Lot opened{" "}
          <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{prettyDate(batchDate)}</span> ·
          recording{" "}
          <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{shortDate(recordedOn)}</span>
        </p>
      )}

      {open && rect && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Lot date"
          className="dropdown-panel"
          style={{
            position: "fixed",
            left: rect.left,
            top: rect.top,
            width: 288,
            zIndex: 1000,
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-3)",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "var(--text-md)", fontWeight: 600 }}>Lot date</h3>
            <p className="small" style={{ margin: "2px 0 0", fontSize: "var(--text-2xs)", lineHeight: 1.45 }}>
              The day this lot started. Moving &ldquo;Recorded on&rdquo; never changes it.
            </p>
          </div>

          <DatePicker
            value={batchDate}
            inline
            onChange={(d) => {
              if (!d) return;
              onBatchDateChange(d);
              const id = buildBatchId(d, size);
              if (id) onBatchIdChange(id);
            }}
            ariaLabel="Lot date"
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "8px 10px",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-3)", fontWeight: 600 }}>
              Lot code
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "0.04em",
                color: preview ? "var(--text)" : "var(--text-3)",
              }}
            >
              {preview ?? "—"}
            </span>
          </div>

          <p className="small" style={{ margin: 0, fontSize: "var(--text-2xs)", lineHeight: 1.45 }}>
            The <strong style={{ color: "var(--text-2)" }}>{size}</strong> suffix follows the Size
            field above.
          </p>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                const d = today();
                onBatchDateChange(d);
                const id = buildBatchId(d, size);
                if (id) onBatchIdChange(id);
              }}
              style={{ ...btnStyle, flex: 1 }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ ...btnStyle, flex: 1, background: "var(--accent)", borderColor: "var(--accent)", color: "var(--text-invert)" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** One cell of the composition grid: label above value, left-aligned. */
function Part({
  label,
  value,
  mono,
  muted,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
      <span
        style={{
          fontSize: "var(--text-2xs)",
          fontWeight: 600,
          letterSpacing: "var(--tracking-label)",
          textTransform: "uppercase",
          color: "var(--text-3)",
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          color: muted ? "var(--text-3)" : "var(--text-2)",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </span>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "var(--text-sm)",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  padding: "6px 10px",
  minHeight: 30,
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: "var(--text-xs)",
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

export { MONTH_NAMES };

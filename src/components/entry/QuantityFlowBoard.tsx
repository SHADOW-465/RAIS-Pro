"use client";

import type { CSSProperties } from "react";
import type { FlowBand, FlowChip } from "@/lib/lineage";

const CHIP: CSSProperties = {
  minWidth: 72,
  padding: "6px 10px",
  borderRadius: 4,
  background: "color-mix(in srgb, #3b82f6 78%, #1e3a5f)",
  color: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  boxShadow: "var(--shadow-1)",
};

const CHIP_LABEL: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  opacity: 0.9,
  fontFamily: "var(--font-sans)",
};

const CHIP_VALUE: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.15,
};

const OP: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontWeight: 800,
  fontSize: 16,
  color: "var(--text)",
  padding: "0 4px",
};

function fmt(n: number): string {
  return n > 0 ? n.toLocaleString() : "—";
}

function QtyChip({ label, value }: { label: string; value: number }) {
  return (
    <div style={CHIP} title={`${label} ${value.toLocaleString()}`}>
      <span style={CHIP_LABEL}>{label}</span>
      <span style={CHIP_VALUE}>{fmt(value)}</span>
    </div>
  );
}

function ChipRow({ chip, includeWip }: { chip: FlowChip; includeWip: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <QtyChip label="Checked qty" value={chip.checked} />
      <span style={OP}>=</span>
      <QtyChip label="Accept qty" value={chip.accepted} />
      <span style={OP}>+</span>
      <QtyChip label="Hold qty" value={chip.hold} />
      <span style={OP}>+</span>
      <QtyChip label="Rej qty" value={chip.rejected} />
      {includeWip && (
        <>
          <span style={OP}>+</span>
          <QtyChip label="Work in process" value={chip.wip} />
        </>
      )}
    </div>
  );
}

function ConvertBox({
  chip,
  toBatch,
  remainLabel,
}: {
  chip: FlowChip;
  toBatch: string | null;
  remainLabel: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      {remainLabel && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#fff",
            background: "var(--accent)",
            padding: "3px 8px",
            borderRadius: 3,
            whiteSpace: "nowrap",
          }}
        >
          remain qty
        </span>
      )}
      <div
        style={{
          background: "color-mix(in srgb, var(--accent) 22%, #6b4a1b)",
          border: "1px solid color-mix(in srgb, var(--accent) 50%, transparent)",
          borderRadius: 6,
          padding: "8px 10px",
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(64px, 1fr))",
          gap: 6,
          minWidth: 168,
        }}
      >
        <div
          style={{
            gridColumn: "1 / -1",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#fff",
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>Convert batch</span>
          {toBatch && (
            <span style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>{toBatch}</span>
          )}
        </div>
        <Mini label="Checked" value={chip.checked} />
        <Mini label="Accept" value={chip.accepted} />
        <Mini label="Hold" value={chip.hold} />
        <Mini label="Rej" value={chip.rejected} />
      </div>
      {chip.wip > 0 && (
        <div
          style={{
            ...CHIP,
            background: "color-mix(in srgb, #2563eb 70%, #0f172a)",
            minWidth: 56,
          }}
        >
          <span style={CHIP_LABEL}>WIP</span>
          <span style={CHIP_VALUE}>{fmt(chip.wip)}</span>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "color-mix(in srgb, #fff 16%, transparent)",
        borderRadius: 4,
        padding: "4px 6px",
        color: "#fff",
      }}
    >
      <div style={{ ...CHIP_LABEL, fontSize: 8 }}>{label}</div>
      <div style={{ ...CHIP_VALUE, fontSize: 14 }}>{fmt(value)}</div>
    </div>
  );
}

function bandFill(laneId: string, assemblyIndex: number): string {
  if (laneId === "primary") return "color-mix(in srgb, #d4b896 55%, var(--surface))";
  if (laneId === "secondary") return "color-mix(in srgb, #8b8f99 38%, var(--surface))";
  if (assemblyIndex % 2 === 0) return "color-mix(in srgb, #e8c547 42%, var(--surface))";
  return "color-mix(in srgb, var(--accent) 38%, #e8a050)";
}

export default function QuantityFlowBoard({
  originalBatch,
  bands,
  onPickChangeStation,
}: {
  originalBatch: string;
  bands: FlowBand[];
  onPickChangeStation?: (stageId: string, remainQty: number) => void;
}) {
  let assemblyIndex = 0;

  return (
    <div
      style={{
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        background: "var(--surface)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)" }}>
          We took a batch{" "}
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--text)" }}>
            {originalBatch || "—"}
          </span>
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
          Checked = accept + hold + reject + WIP. Remain qty becomes the convert stream.
        </p>
      </div>

      {bands.map((band) => {
        const idx = band.laneId === "assembly" ? assemblyIndex++ : -1;
        const includeWip = band.laneId !== "primary" || band.original.wip > 0;
        const productionTotal = band.laneId === "primary" ? band.original.checked : 0;
        return (
          <div
            key={band.stageId}
            style={{
              background: bandFill(band.laneId, Math.max(0, idx)),
              padding: "12px 14px 14px",
              borderTop: "1px solid color-mix(in srgb, var(--ink) 8%, transparent)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: 10,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--text)",
                }}
              >
                {band.label}
              </span>
              {productionTotal > 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, fontSize: 18 }}>
                  {productionTotal.toLocaleString()}
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <ChipRow chip={band.original} includeWip={includeWip && !band.convert} />

              {band.convert ? (
                <ConvertBox
                  chip={band.convert}
                  toBatch={band.toBatch}
                  remainLabel={band.isChangeStation || band.remainQty > 0}
                />
              ) : (
                onPickChangeStation &&
                band.original.wip > 0 && (
                  <button
                    type="button"
                    onClick={() => onPickChangeStation(band.stageId, band.original.wip)}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--accent)",
                      background: "color-mix(in srgb, var(--accent) 12%, var(--surface))",
                      border: "1px solid color-mix(in srgb, var(--accent) 40%, var(--border))",
                      borderRadius: 4,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Remain qty {band.original.wip.toLocaleString()} · convert here
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

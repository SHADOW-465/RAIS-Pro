"use client";

import { useState } from "react";
import DataTable, { type Column } from "@/components/ui/DataTable";
import FloatingDetailModal from "@/components/FloatingDetailModal";
import FiltersPopover from "@/components/ui/FiltersPopover";
import { EmptyState, GhostButton, KpiTile, PrimaryAction, StatusBadge } from "@/components/ui/primitives";
import { activeFilterCount, formatDelta } from "@/components/ui/shared-logic";

type Row = { batch: string; stage: string; rate: number | null; qty: number };
const ROWS: Row[] = [
  { batch: "B-2411-01", stage: "Dipping", rate: 4.2, qty: 1200 },
  { batch: "B-2411-02", stage: "Stripping", rate: 1.1, qty: 900 },
  { batch: "B-2411-03", stage: "Inspection", rate: null, qty: 640 },
  { batch: "B-2411-04", stage: "Dipping", rate: 7.8, qty: 1500 },
];
const COLS: Column<Row>[] = [
  { id: "batch", header: "Batch", mono: true, render: (r) => r.batch, value: (r) => r.batch },
  { id: "stage", header: "Stage", render: (r) => r.stage, value: (r) => r.stage },
  { id: "rate", header: "Rate", mono: true, align: "right", render: (r) => (r.rate === null ? "—" : `${r.rate}%`), value: (r) => r.rate },
  { id: "qty", header: "Qty", mono: true, align: "right", render: (r) => r.qty, value: (r) => r.qty },
];

export default function Demo() {
  const [drawer, setDrawer] = useState(false);
  const [stage, setStage] = useState("");
  const rows = stage ? ROWS.filter((r) => r.stage === stage) : ROWS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      <h1 className="h1">Shared components</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <KpiTile label="Rejection rate" value={4.3} suffix="%" status="critical" delta={formatDelta(4.3, 3.1)} hint="vs last period" onOpen={() => setDrawer(true)} />
        <KpiTile label="Worst gate" value="Dipping" status="warning" hint="7.8% rejected" />
        <KpiTile label="Stalled lots" value={0} status="ok" delta={formatDelta(0, 2, { lowerIsBetter: true, digits: 0 })} />
        <KpiTile label="No data yet" value={NaN} status="neutral" />
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <PrimaryAction>Review issues</PrimaryAction>
        <GhostButton>Secondary</GhostButton>
        <StatusBadge status="ok" />
        <StatusBadge status="warning" />
        <StatusBadge status="critical" />
        <StatusBadge status="neutral" />
        <FiltersPopover count={activeFilterCount({ stage })} onClear={() => setStage("")}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-sm)" }}>
            Stage
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">All</option>
              <option>Dipping</option>
              <option>Stripping</option>
              <option>Inspection</option>
            </select>
          </label>
        </FiltersPopover>
      </div>
      <DataTable
        columns={COLS}
        rows={rows}
        rowKey={(r) => r.batch}
        exportName="demo-batches"
        onRowClick={() => setDrawer(true)}
        expand={(r) => <span style={{ fontSize: "var(--text-sm)" }}>Stages done for {r.batch}: …</span>}
      />
      <EmptyState title="No lots match" body="Clear a filter to see more." />
      <FloatingDetailModal
        isOpen={drawer}
        onClose={() => setDrawer(false)}
        title="Rejection rate"
        insight="Summary, batches and history for this metric."
      >
        <DataTable columns={COLS} rows={ROWS} rowKey={(r) => r.batch} />
      </FloatingDetailModal>
    </div>
  );
}

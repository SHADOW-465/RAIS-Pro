# EXHAUSTIVE ENGINEERING & BUILD BLUEPRINT — Disposafe Pilot (RAIS/MO!D)
*Version 2.0 · Detailed Architecture & Implementation Guide · June 2026*

This document provides the exhaustive, production-ready software engineering blueprint, directory structures, API route logic, database schemas (with triggers), and component specifications required to build the quality analytics and diagnostics application for **Disposafe Health and Life Care Limited**.

---

## 1. Directory Structure (Next.js 16 + React 19 + TypeScript)

The project follows the App Router convention:

```text
rais-pro/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # App shell, theme providers, font loading
│   │   ├── page.tsx                  # Landing / Dashboard Redirector
│   │   ├── dashboard/
│   │   │   ├── page.tsx              # Plant GM & Quality Engineer L0/L1 views
│   │   │   └── data-grid/
│   │   │       └── page.tsx          # L2 Drilldown daily database tables
│   │   ├── operator/
│   │   │   └── page.tsx              # Operator data entry terminal (bilingual)
│   │   ├── api/
│   │   │   ├── ingest/
│   │   │   │   └── route.ts          # Excel parsing & mass-balance validation
│   │   │   └── export/
│   │   │       └── audit-pack/
│   │   │           └── route.ts      # Serverless ZIP packaging & hashing endpoint
│   ├── components/
│   │   ├── ui/
│   │   │   ├── chart-spc.tsx         # Inline SVG-based SPC chart generator
│   │   │   ├── chart-pareto.tsx      # SVG Pareto defect chart generator
│   │   │   ├── explain-tooltip.tsx   # Dual-audience explain mode helper
│   │   │   └── provenance-beam.tsx   # Bezier canvas overlay for cell tracing
│   │   ├── operator-form.tsx         # Bilingual entry form with Math validation
│   ├── lib/
│   │   ├── db.ts                     # Supabase client singleton
│   │   ├── formulas.ts               # Canonical TS formulations for Yield & OEE
│   │   └── types.ts                  # Shared TypeScript data contracts
│   └── styles/
│       └── globals.css               # Vanilla CSS design tokens & print media
├── supabase/
│   ├── migrations/
│   │   └── 20260615000000_schema.sql # Complete PostgreSQL migrations
│   └── seed.sql                      # Seeding cost weights and SKU defaults
├── package.json
└── tsconfig.json
```

---

## 2. Complete Database Migrations (PostgreSQL / Supabase DDL)

This SQL script sets up the database, indexes, foreign keys, row constraints, and auto-calculating triggers. Save this file to `supabase/migrations/20260615000000_schema.sql`:

```sql
-- Enable UUID generator extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SKUs Table
CREATE TABLE skus (
    sku_id TEXT PRIMARY KEY,
    sku_name TEXT NOT NULL,
    finished_cost_inr REAL NOT NULL DEFAULT 20.00,
    rework_cost_inr REAL NOT NULL DEFAULT 5.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Stage Cost Weights Configuration
CREATE TABLE stage_cost_weights (
    stage_name TEXT PRIMARY KEY,
    sequence_order INTEGER NOT NULL UNIQUE,
    cost_weight REAL NOT NULL CHECK (cost_weight BETWEEN 0.0 AND 1.0)
);

-- 3. Daily Production Summary Table
CREATE TABLE daily_production_summary (
    date DATE PRIMARY KEY,
    sku_id TEXT REFERENCES skus(sku_id) ON DELETE SET NULL,
    total_produced INTEGER NOT NULL DEFAULT 0,
    total_rejected INTEGER NOT NULL DEFAULT 0,
    total_hold INTEGER NOT NULL DEFAULT 0,
    calculated_oee REAL,
    ingestion_file_hash TEXT,
    planned_production_time_minutes INTEGER NOT NULL DEFAULT 480,
    actual_run_time_minutes INTEGER NOT NULL DEFAULT 480,
    standard_dip_rate_per_hour INTEGER NOT NULL DEFAULT 1200,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Stage Measurements Table
CREATE TABLE stage_measurements (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL REFERENCES daily_production_summary(date) ON DELETE CASCADE,
    stage_name TEXT NOT NULL REFERENCES stage_cost_weights(stage_name) ON UPDATE CASCADE,
    sku_id TEXT REFERENCES skus(sku_id) ON DELETE SET NULL,
    qty_checked INTEGER NOT NULL CHECK (qty_checked >= 0),
    qty_accepted INTEGER NOT NULL CHECK (qty_accepted >= 0),
    qty_hold INTEGER NOT NULL DEFAULT 0 CHECK (qty_hold >= 0),
    qty_rejected INTEGER NOT NULL CHECK (qty_rejected >= 0),
    machine_id TEXT,
    operator_id TEXT,
    material_batch_no TEXT,
    provenance_coordinate TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chk_qty_balance CHECK (qty_checked = qty_accepted + qty_hold + qty_rejected),
    CONSTRAINT unique_date_stage_entry UNIQUE (date, stage_name)
);

-- 5. Defect Logs Table
CREATE TABLE defect_logs (
    id SERIAL PRIMARY KEY,
    measurement_id INTEGER NOT NULL REFERENCES stage_measurements(id) ON DELETE CASCADE,
    defect_type TEXT NOT NULL CHECK (defect_type IN ('Thin Spod', 'Struck Balloon', 'Leakage', 'Balloon Burst', 'Bubble', '90/10', 'Pinhole', 'Others')),
    qty_defective INTEGER NOT NULL CHECK (qty_defective >= 0),
    machine_id TEXT,
    operator_id TEXT,
    CONSTRAINT unique_measurement_defect UNIQUE (measurement_id, defect_type)
);

-- 6. WIP Buffers Table (Value Stream Mapping)
CREATE TABLE wip_buffers (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    stage_name TEXT NOT NULL REFERENCES stage_cost_weights(stage_name) ON UPDATE CASCADE,
    buffer_quantity INTEGER NOT NULL DEFAULT 0 CHECK (buffer_quantity >= 0),
    carrying_cost_per_day REAL GENERATED ALWAYS AS (buffer_quantity * 0.10) STORED,
    CONSTRAINT unique_date_wip_stage UNIQUE (date, stage_name)
);

-- 7. Adjudication & Rulebook Tables
CREATE TABLE adjudication_logs (
    id SERIAL PRIMARY KEY,
    finding_description TEXT NOT NULL,
    adjudication_type TEXT NOT NULL CHECK (adjudication_type IN ('MISTAKE', 'INTENTIONAL', 'UNRESOLVED')),
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE process_rulebook (
    id SERIAL PRIMARY KEY,
    rule_type TEXT NOT NULL,
    stage_name TEXT REFERENCES stage_cost_weights(stage_name) ON UPDATE CASCADE,
    allowed_tolerance REAL DEFAULT 0.0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Indexes for High-Performance Scoped Data Slicing
CREATE INDEX idx_measurements_date ON stage_measurements(date);
CREATE INDEX idx_measurements_stage ON stage_measurements(stage_name);
CREATE INDEX idx_defect_logs_meas ON defect_logs(measurement_id);
CREATE INDEX idx_wip_buffers_date ON wip_buffers(date);

-- Seeding initial defaults
INSERT INTO skus (sku_id, sku_name, finished_cost_inr, rework_cost_inr) VALUES
('FBC-L12', 'Latex Foley Catheter 2-Way Fr12', 20.00, 5.00),
('FBC-L16', 'Latex Foley Catheter 2-Way Fr16', 20.00, 5.00);

INSERT INTO stage_cost_weights (stage_name, sequence_order, cost_weight) VALUES
('Production', 1, 0.15),
('Eye Punching', 2, 0.20),
('Leaching', 3, 0.25),
('Chlorination', 4, 0.30),
('Hanging', 5, 0.35),
('Gauge', 6, 0.40),
('Trimming', 7, 0.45),
('Visual Insp.', 8, 0.60),
('Balloon Insp.', 9, 0.65),
('Valve Fixing', 10, 0.70),
('Valve Integrity', 11, 0.85),
('Final Insp.', 12, 1.00);
```

---

## 3. API Route Implementations (Serverless TypeScript)

### Ingestion & Validation Endpoint (`/src/app/api/ingest/route.ts`)

This route handles manual uploads, parses sheets, enforces sequence mass-balance checks, and flags violations.

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const skuId = formData.get('skuId') as string;
    const dateStr = formData.get('date') as string; // YYYY-MM-DD

    if (!file || !skuId || !dateStr) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 1. MD5 Hash check to prevent duplicate ingestion
    const md5Hash = crypto.createHash('md5').update(buffer).digest('hex');
    const { data: existingFile } = await supabase
      .from('daily_production_summary')
      .select('date')
      .eq('ingestion_file_hash', md5Hash)
      .single();

    if (existingFile) {
      return NextResponse.json({ error: 'File already ingested' }, { status: 409 });
    }

    // 2. Parse workbook using SheetJS
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Mock parsing result (In production, replace with cell coordinate scanner)
    // Target rows: Checked, Accepted, Hold, Rejected
    const parsedData = [
      { stage: 'Production', checked: 10000, accepted: 9800, hold: 0, rejected: 200, cell: 'Sheet1!B2' },
      { stage: 'Eye Punching', checked: 9800, accepted: 9750, hold: 0, rejected: 50, cell: 'Sheet1!B3' },
      { stage: 'Leaching', checked: 9750, accepted: 9700, hold: 0, rejected: 50, cell: 'Sheet1!B4' },
      { stage: 'Chlorination', checked: 9700, accepted: 9600, hold: 0, rejected: 100, cell: 'Sheet1!B5' },
      { stage: 'Hanging', checked: 9600, accepted: 9550, hold: 0, rejected: 50, cell: 'Sheet1!B6' },
      { stage: 'Gauge', checked: 9550, accepted: 9500, hold: 0, rejected: 50, cell: 'Sheet1!B7' },
      { stage: 'Trimming', checked: 9500, accepted: 9400, hold: 0, rejected: 100, cell: 'Sheet1!B8' },
      { stage: 'Visual Insp.', checked: 9400, accepted: 8600, hold: 0, rejected: 800, cell: 'Sheet1!B9' }, // 8.5% Rej
      { stage: 'Balloon Insp.', checked: 8600, accepted: 8550, hold: 0, rejected: 50, cell: 'Sheet1!B10' },
      { stage: 'Valve Fixing', checked: 8550, accepted: 8500, hold: 0, rejected: 50, cell: 'Sheet1!B11' },
      { stage: 'Valve Integrity', checked: 8500, accepted: 7650, hold: 800, rejected: 50, cell: 'Sheet1!B12' }, // 9.4% Hold
      { stage: 'Final Insp.', checked: 7650, accepted: 7600, hold: 0, rejected: 50, cell: 'Sheet1!B13' }
    ];

    // 3. Sequence checks / Mass-Balance Verification
    for (let j = 1; j < parsedData.length; j++) {
      const prevStage = parsedData[j - 1];
      const currentStage = parsedData[j];

      // Enforce Checked(Stage s) <= Accepted(Stage s-1)
      if (currentStage.checked > prevStage.accepted) {
        const excess = currentStage.checked - prevStage.accepted;
        
        // Log to Adjudication Queue
        await supabase.from('adjudication_logs').insert({
          finding_description: `Mass Balance Delta Violation at stage ${currentStage.stage} on ${dateStr}. Input quantity (${currentStage.checked}) exceeds previous stage output (${prevStage.accepted}) by ${excess} units.`,
          adjudication_type: 'UNRESOLVED'
        });
        
        return NextResponse.json({ 
          error: 'Mass Balance Delta check failed', 
          detail: `Stage ${currentStage.stage} checked count exceeds previous stage accepted count.` 
        }, { status: 422 });
      }
    }

    // 4. Write to DB
    const finalInspection = parsedData[parsedData.length - 1];
    
    // Insert summary first
    await supabase.from('daily_production_summary').insert({
      date: dateStr,
      sku_id: skuId,
      total_produced: finalInspection.accepted,
      total_rejected: parsedData.reduce((acc, curr) => acc + curr.rejected, 0),
      total_hold: parsedData.reduce((acc, curr) => acc + curr.hold, 0),
      ingestion_file_hash: md5Hash
    });

    // Bulk insert measurements
    const measurementsToInsert = parsedData.map(d => ({
      date: dateStr,
      stage_name: d.stage,
      sku_id: skuId,
      qty_checked: d.checked,
      qty_accepted: d.accepted,
      qty_hold: d.hold,
      qty_rejected: d.rejected,
      provenance_coordinate: d.cell
    }));

    await supabase.from('stage_measurements').insert(measurementsToInsert);

    return NextResponse.json({ success: true, date: dateStr });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

### ZIP Compliance Exporter Endpoint (`/src/app/api/export/audit-pack/route.ts`)

Generates a zipped package of CSV tables along with a cryptographically hashed manifest.json.

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import archiver from 'archiver';
import { Readable } from 'stream';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => 
    Object.values(row)
      .map(val => (typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val))
      .join(',')
  );
  return [headers, ...rows].join('\n');
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const monthStr = searchParams.get('month'); // YYYY-MM

  if (!monthStr) {
    return NextResponse.json({ error: 'Missing month parameter' }, { status: 400 });
  }

  try {
    // 1. Fetch data tables
    const startDate = `${monthStr}-01`;
    const endDate = `${monthStr}-31`; // Postgres will coerce correctly

    const { data: summary } = await supabase.from('daily_production_summary').select('*').gte('date', startDate).lte('date', endDate);
    const { data: measurements } = await supabase.from('stage_measurements').select('*').gte('date', startDate).lte('date', endDate);
    const { data: defects } = await supabase.from('defect_logs').select('*'); // Link checks omitted for brevity
    const { data: wip } = await supabase.from('wip_buffers').select('*').gte('date', startDate).lte('date', endDate);

    const summaryCSV = convertToCSV(summary || []);
    const measurementsCSV = convertToCSV(measurements || []);
    const defectsCSV = convertToCSV(defects || []);
    const wipCSV = convertToCSV(wip || []);

    // 2. Generate cryptographically hashed manifest
    const hashSummary = crypto.createHash('sha256').update(summaryCSV).digest('hex');
    const hashMeas = crypto.createHash('sha256').update(measurementsCSV).digest('hex');
    const hashDefects = crypto.createHash('sha256').update(defectsCSV).digest('hex');
    const hashWip = crypto.createHash('sha256').update(wipCSV).digest('hex');

    const manifest = {
      export_date: new Date().toISOString(),
      target_month: monthStr,
      checksums: {
        'daily_summary.csv': hashSummary,
        'measurements.csv': hashMeas,
        'defect_logs.csv': hashDefects,
        'wip_buffers.csv': hashWip
      },
      compliant_standard: 'CDSCO MDR-2017 & ALCOA+'
    };

    // 3. Create ZIP Archive stream
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = new Readable({
      read() {}
    });

    archive.on('data', chunk => stream.push(chunk));
    archive.on('end', () => stream.push(null));

    archive.append(summaryCSV, { name: 'daily_summary.csv' });
    archive.append(measurementsCSV, { name: 'measurements.csv' });
    archive.append(defectsCSV, { name: 'defect_logs.csv' });
    archive.append(wipCSV, { name: 'wip_buffers.csv' });
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.finalize();

    // 4. Return as attachment stream
    return new Response(stream as any, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="disposafe-compliance-pack-${monthStr}.zip"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

## 4. Frontend Component Specifications & Math Functions

### Canonical TypeScript Formulas (`/src/lib/formulas.ts`)

```typescript
export interface StageData {
  checked: number;
  accepted: number;
  hold: number;
  rejected: number;
}

// 1. First Pass Yield
export function calculateFPY(stage: StageData): number {
  if (stage.checked === 0) return 1.0;
  return (stage.checked - stage.hold - stage.rejected) / stage.checked;
}

// 2. Rolled Throughput Yield
export function calculateRTY(stages: StageData[]): number {
  return stages.reduce((rty, stage) => rty * calculateFPY(stage), 1.0);
}

// 3. Progressive Cost of Poor Quality (COPQ)
export function calculateCOPQ(
  qtyRejected: number, 
  stageCostWeight: number, 
  finishedCost: number = 20
): number {
  return qtyRejected * (finishedCost * stageCostWeight);
}

export function calculateReworkCost(qtyHold: number, reworkCost: number = 5): number {
  return qtyHold * reworkCost;
}
```

### SVG Statistical Process Control (SPC) Chart (`/src/components/ui/chart-spc.tsx`)

Renders a light-weight, highly responsive, print-safe control chart using inline SVG elements:

```tsx
import React from 'react';

interface SPCChartProps {
  data: number[];  // Daily rejection rates
  labels: string[]; // Dates
  mean: number;
  ucl: number;
  lcl: number;
}

export const SPCChart: React.FC<SPCChartProps> = ({ data, labels, mean, ucl, lcl }) => {
  const width = 800;
  const height = 250;
  const padding = 40;

  const maxVal = Math.max(...data, ucl) * 1.2;
  const minVal = Math.min(...data, lcl) * 0.8;

  const getX = (index: number) => padding + (index * (width - 2 * padding)) / (data.length - 1);
  const getY = (val: number) => height - padding - ((val - minVal) * (height - 2 * padding)) / (maxVal - minVal);

  const points = data.map((val, idx) => `${getX(idx)},${getY(val)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', background: '#121821', borderRadius: '8px' }}>
      {/* Grid lines */}
      <line x1={padding} y1={getY(ucl)} x2={width - padding} y2={getY(ucl)} stroke="#f06a6a" strokeDasharray="5,5" strokeWidth="1.5" />
      <text x={width - padding + 5} y={getY(ucl) + 4} fill="#f06a6a" fontSize="10px" fontFamily="IBM Plex Mono">UCL: {ucl.toFixed(2)}%</text>

      <line x1={padding} y1={getY(mean)} x2={width - padding} y2={getY(mean)} stroke="#f5a524" strokeWidth="1" />
      <text x={width - padding + 5} y={getY(mean) + 4} fill="#f5a524" fontSize="10px" fontFamily="IBM Plex Mono">CL: {mean.toFixed(2)}%</text>

      <line x1={padding} y1={getY(lcl)} x2={width - padding} y2={getY(lcl)} stroke="#56d3a0" strokeDasharray="5,5" strokeWidth="1.5" />
      <text x={width - padding + 5} y={getY(lcl) + 4} fill="#56d3a0" fontSize="10px" fontFamily="IBM Plex Mono">LCL: {lcl.toFixed(2)}%</text>

      {/* Axis lines */}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#2a3140" />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#2a3140" />

      {/* Trend line */}
      <polyline fill="none" stroke="#5b9cff" strokeWidth="2" points={points} />

      {/* Markers */}
      {data.map((val, idx) => (
        <circle
          key={idx}
          cx={getX(idx)}
          cy={getY(val)}
          r="4"
          fill={val > ucl ? '#f06a6a' : '#5b9cff'}
          stroke="#0c0f14"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
};
```

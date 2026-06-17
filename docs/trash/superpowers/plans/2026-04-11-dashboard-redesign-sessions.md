# RAIS Dashboard Redesign + Sessions + Insight Slides — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current light UI with glassmorphism, add persistent session history via Supabase, and make follow-up questions generate visual insight slides instead of plain text.

**Architecture:** Four sequential phases, each independently shippable. Phase 1 is pure visual — same app logic, new styles. Phase 2 adds Supabase persistence and routing. Phase 3 replaces chat text answers with visual slide components. Phase 4 adds print/export.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Framer Motion 12, Supabase JS v2, Chart.js 4, html2canvas (added in Phase 4)

---

## File Map

### Phase 1 — Glassmorphism UI

| Action | File | Purpose |
|---|---|---|
| Modify | `src/app/globals.css` | Replace colour tokens + glass component classes |
| Modify | `src/app/layout.tsx` | Fixed gradient background, remove dark-mode script |
| Modify | `src/app/page.tsx` | Add sessions skeleton grid above upload zone |
| Create | `src/components/SessionCard.tsx` | Session card for home grid (skeleton in P1, real data in P2) |
| Modify | `src/components/UploadZone.tsx` | Glassmorphism drop zone |
| Modify | `src/components/ProcessingLoader.tsx` | Glassmorphism loader |
| Modify | `src/components/KPICard.tsx` | Glassmorphism card |
| Modify | `src/components/ChartContainer.tsx` | Light-mode chart colours |
| Modify | `src/components/Dashboard.tsx` | Glassmorphism layout + Home breadcrumb |
| Modify | `src/components/ChatPanel.tsx` | Frosted pill input |
| Modify | `src/components/StatusAlert.tsx` | Glassmorphism alert |
| Modify | `src/components/ThemeToggle.tsx` | Hide (no-op; dark mode is future) |

### Phase 2 — Supabase Sessions

| Action | File | Purpose |
|---|---|---|
| Create | `src/lib/device-id.ts` | localStorage UUID init + read |
| Modify | `src/lib/supabase.ts` | Add server-side client (service role key) |
| Create | `supabase/migrations/001_sessions.sql` | sessions + insight_slides tables |
| Modify | `src/app/api/analyze/route.ts` | Save session after analysis, return `sessionId` |
| Create | `src/app/api/sessions/route.ts` | GET list sessions for device |
| Create | `src/app/api/sessions/[id]/route.ts` | GET single session + DELETE |
| Create | `src/app/session/[id]/page.tsx` | Server component: load session from DB, render Dashboard |
| Modify | `src/app/page.tsx` | Fetch real sessions, navigate to `/session/[id]` after analysis |

### Phase 3 — Insight Slides

| Action | File | Purpose |
|---|---|---|
| Modify | `src/types/dashboard.ts` | Add `InsightSlide` type |
| Modify | `src/app/api/chat/route.ts` | New prompt + slide JSON response schema |
| Create | `src/components/InsightSlide.tsx` | Renders headline + mini charts + bullets |
| Modify | `src/components/ChatPanel.tsx` | Send `sessionId`, render `InsightSlide`, save to DB |
| Create | `src/app/api/sessions/[id]/slides/route.ts` | POST save slide, GET list slides |
| Modify | `src/app/session/[id]/page.tsx` | Load + render stored slides below dashboard |

### Phase 4 — Export

| Action | File | Purpose |
|---|---|---|
| Modify | `src/app/globals.css` | `@media print` stylesheet |
| Modify | `src/components/Dashboard.tsx` | Wire Export button to `window.print()` |
| Modify | `src/components/InsightSlide.tsx` | Per-slide PNG download via html2canvas |

---

## PHASE 1 — Glassmorphism UI Redesign

---

### Task 1: Replace CSS design tokens and glass component classes

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace the entire file content**

```css
@import "tailwindcss";

@theme {
  /* Glassmorphism light theme */
  --color-background: #f8faff;
  --color-surface: #ffffff;
  --color-surface-raised: #ffffff;
  --color-accent: #6366f1;
  --color-accent-secondary: #0ea5e9;
  --color-border: rgba(255, 255, 255, 0.80);
  --color-text-primary: #1e293b;
  --color-text-secondary: #475569;
  --color-text-muted: #94a3b8;
  --color-success: #10b981;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;

  --font-sans: var(--font-inter);
  --font-condensed: var(--font-barlow-semi-condensed);
  --font-display: var(--font-space-grotesk);

  --radius-xl: 0.75rem;
  --radius-2xl: 1rem;
}

@layer base {
  html {
    min-height: 100vh;
    background: linear-gradient(145deg, #dbeafe 0%, #ede9fe 50%, #fce7f3 100%);
    background-attachment: fixed;
  }

  body {
    background: transparent;
    @apply text-text-primary font-sans antialiased;
    min-height: 100vh;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-display tracking-tight;
  }
}

@layer components {
  /* Standard frosted glass surface */
  .glass {
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.80);
  }

  /* Card variant — rounded with hover lift */
  .glass-card {
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.80);
    border-radius: 14px;
    transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
  }

  .glass-card:hover {
    background: rgba(255, 255, 255, 0.70);
    border-color: rgba(255, 255, 255, 0.92);
    transform: translateY(-1px);
  }

  /* Tinted card — for active/highlighted states */
  .glass-tinted {
    background: rgba(99, 102, 241, 0.08);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(99, 102, 241, 0.20);
    border-radius: 14px;
  }

  /* Insight slide accent — sky blue left border */
  .glass-slide {
    background: rgba(14, 165, 233, 0.06);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.80);
    border-left: 3px solid #0ea5e9;
    border-radius: 14px;
  }

  /* Executive summary — indigo left border */
  .glass-summary {
    background: rgba(99, 102, 241, 0.06);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.80);
    border-left: 3px solid #6366f1;
    border-radius: 14px;
  }

  /* Primary CTA — indigo→sky gradient pill */
  .btn-primary {
    background: linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%);
    @apply text-white font-semibold py-2 px-5 rounded-full text-sm
           transition-all duration-200
           hover:shadow-[0_4px_14px_rgba(99,102,241,0.40)]
           hover:scale-[1.02] active:scale-95;
  }

  /* Ghost button — frosted pill */
  .btn-ghost {
    background: rgba(255, 255, 255, 0.55);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    @apply border border-white/80 text-slate-500 font-medium py-2 px-4
           rounded-full text-sm transition-all duration-200
           hover:bg-white/70;
  }

  /* Topbar — slightly more opaque glass */
  .topbar {
    background: rgba(255, 255, 255, 0.50);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.65);
  }
}

/* Slow pulse for processing steps */
.animate-pulse-slow {
  animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 2: Verify dev server starts without CSS errors**

```bash
cd "C:/Users/acer/Documents/projects/RAIS-Pro" && npm run dev
```

Expected: Server starts on `http://localhost:3000`. No CSS compilation errors in terminal. The background should now be a soft blue-purple-pink gradient instead of `#F0F4F8`.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(ui): replace CSS tokens with glassmorphism design system"
```

---

### Task 2: Update layout — fixed gradient + remove dark-mode

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace layout.tsx**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow-semi-condensed",
});

export const metadata: Metadata = {
  title: "RAIS | Rejection Analysis & Intelligence System",
  description: "AI-powered operational data intelligence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${barlowSemiCondensed.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

> Note: Space Grotesk and JetBrains Mono removed — Inter is sufficient for the glassmorphism direction. ThemeToggle removed — dark mode is a future phase. No inline script needed since there's no theme switching.

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(ui): clean up layout, remove dark mode, drop unused fonts"
```

---

### Task 3: Create SessionCard component (skeleton for Phase 1)

**Files:**
- Create: `src/components/SessionCard.tsx`

This component is used on the Home screen. In Phase 1 it just renders the card visually. Phase 2 wires it to real data.

- [ ] **Step 1: Create the file**

```tsx
// src/components/SessionCard.tsx
"use client";

import { motion } from "framer-motion";
import type { DashboardConfig } from "@/types/dashboard";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;      // ISO string
  fileNames: string[];
  slideCount: number;
  kpiPreview: Array<{ label: string; value: string | number }>;
}

interface SessionCardProps {
  session: SessionSummary;
  isActive?: boolean;
  onClick: () => void;
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SessionCard({ session, isActive, onClick }: SessionCardProps) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
      onClick={onClick}
      className={`cursor-pointer p-4 ${isActive ? "glass-tinted" : "glass-card"}`}
    >
      {/* Date */}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1.5">
        {relativeDate(session.createdAt)}
      </p>

      {/* Title */}
      <h3 className="text-sm font-bold text-text-primary leading-snug mb-1">
        {session.title}
      </h3>

      {/* File names */}
      <p className="text-[11px] text-text-muted mb-3 truncate">
        {session.fileNames.join(" · ")}
      </p>

      {/* KPI preview */}
      <div className="flex gap-2 mb-3">
        {session.kpiPreview.slice(0, 2).map((kpi, i) => (
          <div
            key={i}
            className="flex-1 bg-white/60 rounded-lg px-2.5 py-2"
          >
            <p className="text-[8px] uppercase tracking-wider text-text-muted">{kpi.label}</p>
            <p className="text-sm font-bold text-text-primary">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-accent bg-accent/8 rounded-full px-2.5 py-1">
          ◈ {session.slideCount} insight {session.slideCount === 1 ? "slide" : "slides"}
        </span>
        <span className="text-[11px] font-semibold text-accent">Open →</span>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify TypeScript accepts it**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SessionCard.tsx
git commit -m "feat(ui): add SessionCard component"
```

---

### Task 4: Restyle Home page — sessions skeleton + upload zone

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace page.tsx**

```tsx
// src/app/page.tsx
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import UploadZone from "@/components/UploadZone";
import ProcessingLoader from "@/components/ProcessingLoader";
import Dashboard from "@/components/Dashboard";
import SessionCard, { type SessionSummary } from "@/components/SessionCard";
import type { DashboardConfig } from "@/types/dashboard";

export type AppState = "home" | "processing" | "dashboard";

// Phase 1: static skeleton sessions so the grid renders visually.
// Phase 2 replaces this with real Supabase data.
const SKELETON_SESSIONS: SessionSummary[] = [];

export default function Home() {
  const [appState, setAppState] = useState<AppState>("home");
  const [analysisData, setAnalysisData] = useState<DashboardConfig | null>(null);
  const [dataSummary, setDataSummary] = useState<string>("");

  const handleUploadComplete = async (files: File[]) => {
    setAppState("processing");
    try {
      const { parseExcelFiles } = await import("@/lib/parser");
      const { runAnalysis } = await import("@/lib/analyzer");
      const summaries = await parseExcelFiles(files);
      const { config, dataSummary: summary } = await runAnalysis(summaries);
      setAnalysisData(config);
      setDataSummary(summary);
      setAppState("dashboard");
    } catch (error) {
      console.error("Analysis failed:", error);
      setAppState("home");
      alert("Analysis failed. Check your API configuration and try again.");
    }
  };

  const handleReset = () => {
    setAppState("home");
    setAnalysisData(null);
    setDataSummary("");
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };

  return (
    <AnimatePresence mode="wait">
      {/* ── HOME ─────────────────────────────────────── */}
      {appState === "home" && (
        <motion.div
          key="home"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen"
        >
          {/* Topbar */}
          <header className="topbar sticky top-0 z-50 px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight"
                style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                RAIS
              </span>
              <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium ml-2">
                Rejection Analysis & Intelligence System
              </span>
            </div>
          </header>

          <main className="max-w-5xl mx-auto px-6 py-10">
            {/* Welcome */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-8"
            >
              <h1 className="text-2xl font-bold text-text-primary mb-1">Good morning.</h1>
              <p className="text-sm text-text-muted">
                Your recent analyses are below. Drop new files to start a fresh session.
              </p>
            </motion.div>

            {/* Sessions grid */}
            {SKELETON_SESSIONS.length > 0 && (
              <div className="mb-8">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-text-muted mb-3">
                  Recent Sessions
                </p>
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  {SKELETON_SESSIONS.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      onClick={() => {/* Phase 2: navigate to /session/[id] */}}
                    />
                  ))}
                </motion.div>
              </div>
            )}

            {/* Upload zone */}
            <UploadZone onUpload={handleUploadComplete} />
          </main>
        </motion.div>
      )}

      {/* ── PROCESSING ───────────────────────────────── */}
      {appState === "processing" && (
        <motion.div
          key="processing"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen flex items-center justify-center"
        >
          <ProcessingLoader />
        </motion.div>
      )}

      {/* ── DASHBOARD ────────────────────────────────── */}
      {appState === "dashboard" && analysisData && (
        <motion.div
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="min-h-screen"
        >
          <Dashboard
            data={analysisData}
            dataSummary={dataSummary}
            onReset={handleReset}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Load http://localhost:3000 and confirm the gradient background + topbar render**

Expected: Soft blue-purple-pink gradient, RAIS logo in gradient text, welcome heading, upload zone below.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): restyle home page with sessions grid and glassmorphism topbar"
```

---

### Task 5: Restyle UploadZone

**Files:**
- Modify: `src/components/UploadZone.tsx`

- [ ] **Step 1: Read current file to understand its props and internal structure**

```bash
cat src/components/UploadZone.tsx
```

- [ ] **Step 2: Replace the JSX return value — keep all logic, only replace className strings and wrapper elements**

The outer wrapper should become `glass-card`, the dashed border zone should use the new palette. Replace the entire `return (...)` block with:

```tsx
return (
  <div className="glass-card p-8 text-center">
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-200 ${
        isDragging
          ? "border-accent bg-accent/5 scale-[1.01]"
          : "border-accent/30 hover:border-accent/50 hover:bg-white/30"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Icon */}
      <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
        <Upload size={22} className="text-accent" />
      </div>

      <h2 className="text-lg font-bold text-text-primary mb-2">
        Drop your Excel files here
      </h2>
      <p className="text-sm text-text-muted mb-5">
        Start a new analysis session — multiple files supported
      </p>

      {/* Format badges */}
      <div className="flex gap-2 justify-center flex-wrap">
        {["XLSX", "XLS", "CSV"].map((fmt) => (
          <span
            key={fmt}
            className="bg-white/60 border border-white/80 rounded-full px-3 py-1 text-[11px] font-semibold text-slate-500"
          >
            {fmt}
          </span>
        ))}
        <span className="bg-white/60 border border-white/80 rounded-full px-3 py-1 text-[11px] font-semibold text-accent">
          Browse files
        </span>
      </div>
    </div>

    {/* File list — rendered below the drop zone when files are queued */}
    {files.length > 0 && (
      <div className="mt-6 space-y-2">
        {files.map((file, i) => (
          <div
            key={i}
            className="flex items-center justify-between bg-white/50 border border-white/70 rounded-xl px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={16} className="text-accent" />
              <div>
                <p className="text-sm font-semibold text-text-primary">{file.name}</p>
                <p className="text-[10px] text-text-muted">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeFile(i); }}
              className="text-text-muted hover:text-danger transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}

        <button
          onClick={handleAnalyze}
          disabled={files.length === 0}
          className="btn-primary w-full mt-4"
        >
          Analyze with AI
        </button>
      </div>
    )}
  </div>
);
```

> Important: keep all existing state variables (`files`, `isDragging`, `fileInputRef`), event handlers (`handleDragOver`, `handleDragLeave`, `handleDrop`, `handleFileChange`, `removeFile`, `handleAnalyze`), and the call to `props.onUpload`. Only the rendered JSX changes. Ensure `Upload`, `FileSpreadsheet`, `X` are imported from `lucide-react`.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Visual check — drop zone renders correctly in browser**

- [ ] **Step 5: Commit**

```bash
git add src/components/UploadZone.tsx
git commit -m "feat(ui): glassmorphism upload zone"
```

---

### Task 6: Restyle ProcessingLoader

**Files:**
- Modify: `src/components/ProcessingLoader.tsx`

- [ ] **Step 1: Read current file**

```bash
cat src/components/ProcessingLoader.tsx
```

- [ ] **Step 2: Replace wrapper and step indicator styles**

Keep the step animation logic intact. Replace all dark-mode className strings with light-glass equivalents. The outer wrapper:

```tsx
<div className="glass-card px-12 py-10 w-full max-w-sm text-center space-y-8">
```

Spinner rings — replace dark stroke colours with indigo/sky:
```tsx
// outer ring
<circle cx="40" cy="40" r="34" stroke="rgba(99,102,241,0.15)" strokeWidth="4" fill="none" />
// animated arc
<circle cx="40" cy="40" r="34" stroke="url(#spinGrad)" strokeWidth="4" fill="none"
  strokeDasharray="60 154" strokeLinecap="round"
  style={{ transformOrigin: "center", animation: "spin 1.4s linear infinite" }} />
// gradient def
<defs>
  <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stopColor="#6366f1" />
    <stop offset="100%" stopColor="#0ea5e9" />
  </linearGradient>
</defs>
```

Step indicators — active step uses `text-accent` ring, done step uses `text-success` check, inactive uses `text-text-muted`. Label text uses `text-text-primary` for active/done, `text-text-muted` for inactive.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/ProcessingLoader.tsx
git commit -m "feat(ui): glassmorphism processing loader"
```

---

### Task 7: Restyle KPICard

**Files:**
- Modify: `src/components/KPICard.tsx`

- [ ] **Step 1: Replace the component**

```tsx
// src/components/KPICard.tsx
"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KPI } from "@/types/dashboard";

interface KPICardProps {
  kpi: KPI;
}

export default function KPICard({ kpi }: KPICardProps) {
  const { label, value, unit, trend, context } = kpi;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
      className="glass-card p-5 flex flex-col justify-between h-full"
    >
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
          {label}
        </p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-text-primary tracking-tight">
            {value}
          </span>
          {unit && (
            <span className="text-sm text-text-muted font-medium">{unit}</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/60 pt-3">
        <div className={`flex items-center gap-1 text-xs font-bold ${
          trend === 1 ? "text-success" : trend === -1 ? "text-danger" : "text-text-muted"
        }`}>
          {trend === 1 ? <TrendingUp size={14} /> : trend === -1 ? <TrendingDown size={14} /> : <Minus size={14} />}
          <span>{trend === 1 ? "Improving" : trend === -1 ? "Declining" : "Stable"}</span>
        </div>
        <span className="text-[10px] text-text-muted">{context || "—"}</span>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/KPICard.tsx
git commit -m "feat(ui): glassmorphism KPI card"
```

---

### Task 8: Restyle ChartContainer — light chart colours

**Files:**
- Modify: `src/components/ChartContainer.tsx`

- [ ] **Step 1: Remove the `useIsDark` hook and hardcode light-mode chart colours**

Replace the `useIsDark` hook and the `isDark`-dependent variables with fixed light values:

```tsx
// Remove useIsDark entirely. Replace the colour variables block with:
const textSecondary = "#475569";
const textMuted     = "#94a3b8";
const tooltipBg     = "#ffffff";
const tooltipBorder = "rgba(0,0,0,0.08)";
const gridColor     = "rgba(0,0,0,0.05)";
```

- [ ] **Step 2: Update the outer wrapper className**

```tsx
className="glass-card p-5 h-[300px] flex flex-col"
```

- [ ] **Step 3: Update the chart title style**

```tsx
<p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-4 pl-3 border-l-2 border-accent/30">
  {title}
</p>
```

- [ ] **Step 4: Update `description` rendering (add below title if present)**

The `ChartContainerProps` already has optional `options`. Add a `description` prop:

```tsx
interface ChartContainerProps {
  title: string;
  description?: string;
  type: ChartType;
  data: any;
  options?: any;
}
```

Render description below title:
```tsx
{description && (
  <p className="text-[11px] text-text-muted mb-3 -mt-2">{description}</p>
)}
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/ChartContainer.tsx
git commit -m "feat(ui): glassmorphism chart container, light chart colours, add description prop"
```

---

### Task 9: Restyle Dashboard — glassmorphism + breadcrumb + Home button

**Files:**
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Update DashboardProps to accept optional navigation callback**

```tsx
interface DashboardProps {
  data: DashboardConfig;
  dataSummary: string;
  onReset: () => void;          // navigates to home
  sessionTitle?: string;        // used in Phase 2 for breadcrumb
}
```

- [ ] **Step 2: Replace the sticky header**

```tsx
<header className="topbar sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
  {/* Left: breadcrumb */}
  <div className="flex items-center gap-2 text-sm">
    <button
      onClick={onReset}
      className="text-accent font-semibold hover:underline"
    >
      ← Home
    </button>
    <span className="text-text-muted">/</span>
    <span className="font-bold text-text-primary truncate max-w-[320px]">
      {currentConfig.dashboardTitle || "Analysis"}
    </span>
  </div>

  {/* Right: actions */}
  <div className="flex items-center gap-3">
    <button onClick={() => window.print()} className="btn-ghost flex items-center gap-2">
      <Download size={14} />
      Export
    </button>
    <button onClick={onReset} className="btn-primary flex items-center gap-2">
      <RefreshCw size={14} />
      New Analysis
    </button>
  </div>
</header>
```

- [ ] **Step 3: Replace the Executive Summary card className**

```tsx
{/* Executive Summary */}
<motion.div variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}>
  <div className="glass-summary p-6 space-y-3">
    <div className="flex items-center gap-2 text-accent text-[10px] font-bold uppercase tracking-widest">
      <Layers size={12} /> Executive Summary
    </div>
    <p className="text-base font-medium text-text-primary leading-relaxed">
      {currentConfig.executiveSummary}
    </p>
  </div>
</motion.div>
```

- [ ] **Step 4: Replace KPI grid wrapper classNames**

```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

- [ ] **Step 5: Replace chart grid wrapper**

```tsx
<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
  {(currentConfig.charts ?? []).map((chart, i) => (
    <ChartContainer
      key={i}
      title={chart.title}
      description={chart.description}
      type={chart.type}
      data={chart.data}
    />
  ))}
</div>
```

- [ ] **Step 6: Replace insights + recommendations wrappers**

```tsx
{/* Insights & Recommendations */}
<div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
  <motion.div
    variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
    className="lg:col-span-2 glass-card p-6 space-y-5"
  >
    <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
      <Info size={12} className="text-accent" /> Key Insights
    </h3>
    <div className="space-y-4">
      {(currentConfig.insights ?? []).map((insight, idx) => (
        <div key={idx} className="flex gap-4 items-start">
          <span className="text-accent/40 font-mono text-base font-bold shrink-0">
            0{idx + 1}
          </span>
          <p className="text-sm text-text-secondary leading-relaxed">{insight}</p>
        </div>
      ))}
    </div>
  </motion.div>

  <motion.div
    variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
    className="glass-tinted p-6 space-y-4"
  >
    <h3 className="text-xs font-bold uppercase tracking-widest text-accent">
      Recommendations
    </h3>
    <ul className="space-y-3">
      {(currentConfig.recommendations ?? []).map((rec, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-text-primary">
          <span className="text-warning mt-0.5 shrink-0">→</span>
          {rec}
        </li>
      ))}
    </ul>
  </motion.div>
</div>
```

- [ ] **Step 7: Replace footer**

```tsx
{/* Data sources footer */}
<div className="flex flex-wrap gap-2 pt-8 border-t border-white/40">
  <span className="text-[10px] text-text-muted mr-2 font-semibold uppercase tracking-wider">Sources:</span>
  <span className="text-[10px] bg-white/50 border border-white/70 rounded-full px-3 py-1 text-text-muted">
    RAIS Analysis
  </span>
</div>
```

- [ ] **Step 8: Add outer page wrapper with `min-h-screen`**

The entire return should be wrapped in:
```tsx
return (
  <div className="min-h-screen">
    {/* sticky header */}
    <div className="max-w-5xl mx-auto px-6 py-8">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
        {/* alerts, summary, kpis, charts, insights, chat, footer */}
      </motion.div>
    </div>
  </div>
);
```

- [ ] **Step 9: Verify TypeScript and visual check**

```bash
npx tsc --noEmit
```

Open `http://localhost:3000`, drop a file, run analysis. Confirm glassmorphism renders on the dashboard.

- [ ] **Step 10: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(ui): glassmorphism dashboard layout, breadcrumb header"
```

---

### Task 10: Restyle ChatPanel — frosted pill input

**Files:**
- Modify: `src/components/ChatPanel.tsx`

- [ ] **Step 1: Replace the outer wrapper and input**

```tsx
return (
  <div className="space-y-4">
    <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
      <MessageCircle size={12} className="text-accent" /> Ask a Follow-Up
    </p>

    {/* Message list */}
    {messages.length === 0 && (
      <p className="text-sm text-text-muted">
        Ask anything about your data — get a focused insight slide back.
      </p>
    )}

    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === "user"
                ? "bg-accent/10 border border-accent/20 text-text-primary"
                : msg.error
                ? "bg-danger/10 border border-danger/20 text-danger"
                : "bg-white/60 border border-white/80 text-text-secondary"
            }`}>
              {msg.isRefresh && <RefreshCw size={11} className="inline mr-1 text-accent" />}
              {msg.content}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
          <div className="bg-white/60 border border-white/80 rounded-2xl px-4 py-2.5 text-sm text-text-muted">
            Generating insight slide…
          </div>
        </motion.div>
      )}
      <div ref={bottomRef} />
    </div>

    {/* Frosted pill input */}
    <div className="flex items-center gap-2 bg-white/55 backdrop-blur-md border border-white/80 rounded-full px-4 py-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
        placeholder="Ask anything about your data…"
        disabled={loading}
        className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none disabled:opacity-50"
      />
      <button
        onClick={sendMessage}
        disabled={loading || !input.trim()}
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
        style={{ background: "linear-gradient(135deg,#6366f1,#0ea5e9)" }}
      >
        <Send size={13} className="text-white" />
      </button>
    </div>
  </div>
);
```

- [ ] **Step 2: Verify TypeScript and commit**

```bash
npx tsc --noEmit
git add src/components/ChatPanel.tsx
git commit -m "feat(ui): glassmorphism chat panel, frosted pill input"
```

---

### Task 11: Restyle StatusAlert

**Files:**
- Modify: `src/components/StatusAlert.tsx`

- [ ] **Step 1: Read the current file**

```bash
cat src/components/StatusAlert.tsx
```

- [ ] **Step 2: Update alert wrapper to use glassmorphism alert styles**

Replace the outer div className with:
```tsx
<div className="rounded-xl px-5 py-4 flex items-start gap-3 border backdrop-blur-md bg-danger/8 border-danger/25">
```

Keep all existing props and alert message rendering unchanged.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/StatusAlert.tsx
git commit -m "feat(ui): glassmorphism status alert"
```

---

### Task 12: End-to-end visual verification of Phase 1

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual smoke test checklist**

Visit `http://localhost:3000` and verify each of these:

- [ ] Background is the blue-purple-pink gradient (not plain white/grey)
- [ ] RAIS logo renders in indigo→sky gradient text
- [ ] Drop zone has dashed border, glass card background
- [ ] Drop 1+ Excel files — file cards appear with glassmorphism styling
- [ ] Click "Analyze with AI" — Processing screen shows with glass card, indigo spinner
- [ ] Dashboard renders: glass KPI cards, glass chart cards, glass insight/recommendation panels
- [ ] "← Home" breadcrumb navigates back to the upload screen
- [ ] Chat input is a frosted pill, not a rectangular input box

- [ ] **Step 3: Commit final Phase 1 state**

```bash
git add -A
git commit -m "feat(phase-1): glassmorphism UI redesign complete"
```

---

## PHASE 2 — Supabase Session Persistence

---

### Task 13: Device ID utility

**Files:**
- Create: `src/lib/device-id.ts`

- [ ] **Step 1: Create the file**

```ts
// src/lib/device-id.ts

const KEY = "rais_device_id";

/**
 * Returns the device ID for this browser.
 * Generates and persists a UUID on first call.
 * Safe to call server-side — returns "" if window is unavailable.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
```

- [ ] **Step 2: Write a unit test**

```ts
// src/__tests__/device-id.test.ts
import { getDeviceId } from "@/lib/device-id";

describe("getDeviceId", () => {
  beforeEach(() => localStorage.clear());

  it("returns empty string in server context (no window)", () => {
    const originalWindow = global.window;
    // @ts-expect-error intentional
    delete global.window;
    expect(getDeviceId()).toBe("");
    global.window = originalWindow;
  });

  it("generates a UUID on first call", () => {
    const id = getDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns the same UUID on subsequent calls", () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(first).toBe(second);
  });
});
```

- [ ] **Step 3: Run the test**

```bash
npm test -- --testPathPattern=device-id
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/device-id.ts src/__tests__/device-id.test.ts
git commit -m "feat(sessions): device ID utility with UUID persistence"
```

---

### Task 14: Add server-side Supabase client

**Files:**
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Replace the file**

```ts
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Browser-safe client (anon key). Used in client components only. */
export const supabase = createClient(url, anon);

/**
 * Server-side client (service role key).
 * NEVER import this in client components — it exposes the service role key.
 * Only use in Next.js API route handlers (server-side).
 */
export function createServerClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 2: Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`**

Open `.env.local` (or create it) and add:
```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Get this from: Supabase dashboard → Project Settings → API → `service_role` key.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat(sessions): add server-side Supabase client (service role)"
```

---

### Task 15: Create Supabase migration

**Files:**
- Create: `supabase/migrations/001_sessions.sql`

- [ ] **Step 1: Create the migration directory and file**

```bash
mkdir -p supabase/migrations
```

```sql
-- supabase/migrations/001_sessions.sql

-- Sessions: one per file-batch analysis
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,
  title       text not null,
  files       jsonb not null default '[]',
  dashboard   jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists sessions_device_id_idx on sessions (device_id, created_at desc);

-- Insight slides: children of a session, one per follow-up question
create table if not exists insight_slides (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  device_id   text not null,
  question    text not null,
  slide       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists slides_session_id_idx on insight_slides (session_id, created_at asc);
```

- [ ] **Step 2: Run the migration in Supabase**

Option A — Supabase CLI (if installed):
```bash
supabase db push
```

Option B — Supabase dashboard:
Open Supabase → SQL Editor → paste the SQL above → Run.

- [ ] **Step 3: Verify tables exist in Supabase dashboard**

Navigate to Table Editor. Confirm `sessions` and `insight_slides` tables are present with the correct columns.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/001_sessions.sql
git commit -m "feat(sessions): Supabase schema for sessions and insight_slides"
```

---

### Task 16: Create sessions API routes

**Files:**
- Create: `src/app/api/sessions/route.ts`
- Create: `src/app/api/sessions/[id]/route.ts`

- [ ] **Step 1: Create `src/app/api/sessions/route.ts`**

```ts
// src/app/api/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("sessions")
      .select("id, title, files, dashboard, created_at")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    return NextResponse.json({ sessions: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `src/app/api/sessions/[id]/route.ts`**

```ts
// src/app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  try {
    const db = createServerClient();

    const [sessionResult, slidesResult] = await Promise.all([
      db.from("sessions").select("*").eq("id", id).eq("device_id", deviceId).single(),
      db.from("insight_slides").select("*").eq("session_id", id).order("created_at", { ascending: true }),
    ]);

    if (sessionResult.error) throw sessionResult.error;
    return NextResponse.json({
      session: sessionResult.data,
      slides: slidesResult.data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { deviceId } = await req.json().catch(() => ({}));
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const { error } = await db
      .from("sessions")
      .delete()
      .eq("id", id)
      .eq("device_id", deviceId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sessions/route.ts src/app/api/sessions/[id]/route.ts
git commit -m "feat(sessions): GET/DELETE sessions API routes"
```

---

### Task 17: Update /api/analyze to save sessions

**Files:**
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Update the POST handler to accept `deviceId` and `fileNames`, save session, return `sessionId`**

Add these imports at the top:
```ts
import { createServerClient } from "@/lib/supabase";
```

Replace the final `return NextResponse.json(result)` line (inside the provider loop) with:

```ts
// Save session to Supabase (best-effort — don't fail analysis if save fails)
let sessionId: string | null = null;
try {
  if (deviceId && typeof deviceId === "string") {
    const db = createServerClient();
    const { data: session } = await db
      .from("sessions")
      .insert({
        device_id: deviceId,
        title: result.dashboardTitle ?? "Analysis",
        files: Array.isArray(fileNames)
          ? fileNames.map((name: string) => ({ name }))
          : [],
        dashboard: result,
      })
      .select("id")
      .single();
    sessionId = session?.id ?? null;
  }
} catch (saveErr) {
  console.warn("[analyze] session save failed (non-fatal):", saveErr);
}

console.log(`[analyze] success via ${name}`);
return NextResponse.json({ ...result, sessionId });
```

Update the destructuring at the top of POST to extract `deviceId` and `fileNames`:
```ts
const { summaries, deviceId, fileNames } = await req.json();
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/analyze/route.ts
git commit -m "feat(sessions): save analysis to Supabase, return sessionId"
```

---

### Task 18: Create /session/[id] page

**Files:**
- Create: `src/app/session/[id]/page.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "src/app/session/[id]"
```

```tsx
// src/app/session/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import ProcessingLoader from "@/components/ProcessingLoader";
import { getDeviceId } from "@/lib/device-id";
import type { DashboardConfig } from "@/types/dashboard";

interface Props {
  params: Promise<{ id: string }>;
}

export default function SessionPage({ params }: Props) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>("");
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [dataSummary] = useState<string>(""); // Phase 3: loaded from session
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => setSessionId(id));
  }, [params]);

  useEffect(() => {
    if (!sessionId) return;
    const deviceId = getDeviceId();

    fetch(`/api/sessions/${sessionId}?deviceId=${encodeURIComponent(deviceId)}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setConfig(body.session.dashboard as DashboardConfig);
      })
      .catch((err) => setError(err.message));
  }, [sessionId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8 max-w-md text-center space-y-4">
          <p className="text-danger font-semibold">Could not load session</p>
          <p className="text-sm text-text-muted">{error}</p>
          <button onClick={() => router.push("/")} className="btn-primary">
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ProcessingLoader />
      </div>
    );
  }

  return (
    <Dashboard
      data={config}
      dataSummary={dataSummary}
      onReset={() => router.push("/")}
    />
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/session/[id]/page.tsx"
git commit -m "feat(sessions): /session/[id] page loads dashboard from Supabase"
```

---

### Task 19: Wire Home page to real sessions + navigate after analysis

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add session fetching and router navigation to the Home page**

Replace the entire `page.tsx` with:

```tsx
// src/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import UploadZone from "@/components/UploadZone";
import ProcessingLoader from "@/components/ProcessingLoader";
import SessionCard, { type SessionSummary } from "@/components/SessionCard";
import { getDeviceId } from "@/lib/device-id";
import type { DashboardConfig } from "@/types/dashboard";

export default function Home() {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  // Load sessions on mount
  useEffect(() => {
    const deviceId = getDeviceId();
    if (!deviceId) { setLoadingSessions(false); return; }

    fetch(`/api/sessions?deviceId=${encodeURIComponent(deviceId)}`)
      .then((r) => r.json())
      .then((body) => {
        const raw = body.sessions ?? [];
        const mapped: SessionSummary[] = raw.map((s: any) => ({
          id: s.id,
          title: s.title,
          createdAt: s.created_at,
          fileNames: (s.files ?? []).map((f: any) => f.name ?? "file"),
          slideCount: 0, // Phase 3: loaded from insight_slides count
          kpiPreview: (s.dashboard?.kpis ?? []).slice(0, 2).map((k: any) => ({
            label: k.label,
            value: k.value,
          })),
        }));
        setSessions(mapped);
      })
      .catch(console.error)
      .finally(() => setLoadingSessions(false));
  }, []);

  const handleUploadComplete = async (files: File[]) => {
    setProcessing(true);
    try {
      // 1. Parse Excel files client-side (no data leaves the browser at this step)
      const { parseExcelFiles } = await import("@/lib/parser");
      const summaries = await parseExcelFiles(files);

      // 2. Send summaries to /api/analyze — AI runs server-side, session saved to Supabase
      const deviceId = getDeviceId();
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaries,
          deviceId,
          fileNames: files.map((f) => f.name),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Analysis failed");
      }

      const body = await res.json();

      if (body.sessionId) {
        // Navigate to the saved session page
        router.push(`/session/${body.sessionId}`);
      } else {
        // Supabase save failed but analysis succeeded — rare edge case
        console.warn("Session not saved; redirecting home");
        router.push("/");
      }
    } catch (error) {
      console.error("Analysis failed:", error);
      setProcessing(false);
      alert("Analysis failed. Check your API configuration and try again.");
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
  };

  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <ProcessingLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Topbar */}
      <header className="topbar sticky top-0 z-50 px-8 py-4 flex items-center">
        <span
          className="text-lg font-extrabold tracking-tight"
          style={{
            background: "linear-gradient(135deg,#6366f1,#0ea5e9)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          RAIS
        </span>
        <span className="text-[10px] uppercase tracking-widest text-text-muted font-medium ml-3">
          Rejection Analysis & Intelligence System
        </span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-text-primary mb-1">Good morning.</h1>
          <p className="text-sm text-text-muted">
            Your recent analyses are below. Drop new files to start a fresh session.
          </p>
        </motion.div>

        {/* Sessions grid */}
        {!loadingSessions && sessions.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-muted mb-3">
              Recent Sessions
            </p>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              {sessions.map((s, i) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  isActive={i === 0}
                  onClick={() => router.push(`/session/${s.id}`)}
                />
              ))}
            </motion.div>
          </section>
        )}

        {/* Upload zone */}
        <UploadZone onUpload={handleUploadComplete} />
      </main>
    </div>
  );
}
```

> Note: `handleUploadComplete` now calls `runAnalysis` locally first (for fast parsing), but also calls `/api/analyze` which re-runs AI and saves to Supabase. To avoid double AI calls, the `/api/analyze` route should be the single source of truth. Simplify: remove the local `runAnalysis` call and let `/api/analyze` do everything. The `UploadZone` passes `File[]` objects; serialize summaries client-side via `parseExcelFiles`, then send to `/api/analyze`. This keeps the flow: parse client-side → send summaries to API → API runs AI + saves → returns sessionId → navigate.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: End-to-end test**

1. Open `http://localhost:3000`
2. Drop an Excel file and click "Analyze with AI"
3. Processing screen appears
4. After analysis: browser navigates to `/session/[uuid]`
5. Dashboard loads from Supabase
6. Click "← Home": returns to `/`
7. Session card appears in the Recent Sessions grid on the Home screen

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(sessions): wire home page to Supabase sessions, navigate after analysis"
```

---

### Task 20: Phase 2 completion commit

- [ ] **Step 1: Full TypeScript check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: No TypeScript errors. Build completes successfully.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(phase-2): Supabase session persistence complete"
```

---

## PHASE 3 — Insight Slides

---

### Task 21: Add InsightSlide type

**Files:**
- Modify: `src/types/dashboard.ts`

- [ ] **Step 1: Add the type to the end of the file**

```ts
// Add to src/types/dashboard.ts

export interface InsightChart {
  title: string;
  type: 'bar' | 'line' | 'doughnut';
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string;
    }>;
  };
}

export interface InsightSlide {
  id?: string;              // set after DB save
  sessionId: string;
  question: string;
  headline: string;
  charts: InsightChart[];   // 1-2 charts
  bullets: string[];        // 3-4 bullets
  createdAt: string;        // ISO timestamp
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/types/dashboard.ts
git commit -m "feat(slides): add InsightSlide type"
```

---

### Task 22: Create insight_slides API route

**Files:**
- Create: `src/app/api/sessions/[id]/slides/route.ts`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p "src/app/api/sessions/[id]/slides"
```

```ts
// src/app/api/sessions/[id]/slides/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { InsightSlide } from "@/types/dashboard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("insight_slides")
      .select("*")
      .eq("session_id", sessionId)
      .eq("device_id", deviceId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ slides: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const body = await req.json();
  const { deviceId, slide } = body as { deviceId: string; slide: InsightSlide };

  if (!deviceId || !slide) {
    return NextResponse.json({ error: "deviceId and slide required" }, { status: 400 });
  }

  try {
    const db = createServerClient();
    const { data, error } = await db
      .from("insight_slides")
      .insert({
        session_id: sessionId,
        device_id: deviceId,
        question: slide.question,
        slide: {
          headline: slide.headline,
          charts: slide.charts,
          bullets: slide.bullets,
          createdAt: slide.createdAt,
        },
      })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/sessions/[id]/slides/route.ts"
git commit -m "feat(slides): GET/POST slides API route"
```

---

### Task 23: Update /api/chat to return insight slide JSON

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Replace the SYSTEM_PROMPT and `buildChatPrompt` function**

```ts
const SYSTEM_PROMPT =
  'You are a data analyst. Given a dataset summary and a user question, return a single valid JSON object — no markdown, no preamble.\n\n' +
  'Return this exact shape:\n' +
  '{\n' +
  '  "question": "<the user question>",\n' +
  '  "headline": "<one sentence finding that MUST contain a specific number>",\n' +
  '  "charts": [ /* 1 chart for simple questions, 2 for comparative questions */ ],\n' +
  '  "bullets": [ /* exactly 3-4 strings, each referencing a specific data point */ ]\n' +
  '}\n\n' +
  'Each chart must follow: { "title": "...", "type": "bar"|"line"|"doughnut", "data": { "labels": [...], "datasets": [{ "label": "...", "data": [...numbers...] }] } }\n' +
  'Only use data values present in the dataset summary. Never invent numbers.';

function buildChatPrompt(
  question: string,
  dataSummary: string,
  currentConfig: DashboardConfig,
): string {
  return `DATASET SUMMARY:
${dataSummary}

DASHBOARD CONTEXT (current KPIs):
${JSON.stringify(currentConfig?.kpis ?? [], null, 2).slice(0, 1500)}

USER QUESTION: ${question}

Return the insight slide JSON object now.`;
}
```

- [ ] **Step 2: Update the POST handler signature and body parsing**

```ts
export async function POST(req: NextRequest) {
  try {
    const { question, dataSummary, currentConfig } = await req.json();
    // Note: history and sessionId are passed but slide generation doesn't use history

    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const prompt = buildChatPrompt(
      question,
      String(dataSummary ?? ""),
      currentConfig ?? {},
    );

    // ... (rest of provider loop unchanged)
```

- [ ] **Step 3: Update the response handling inside the provider loop**

Replace the `raw.type === "answer"` block with:

```ts
// Validate the slide shape
if (
  typeof raw.headline === "string" &&
  Array.isArray(raw.charts) &&
  Array.isArray(raw.bullets)
) {
  const slide = {
    question,
    headline: raw.headline,
    charts: raw.charts,
    bullets: raw.bullets,
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json({ type: "slide", slide });
}

throw new Error(`Unexpected response shape: ${JSON.stringify(raw).slice(0, 200)}`);
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(slides): update /api/chat to return insight slide JSON"
```

---

### Task 24: Create InsightSlide component

**Files:**
- Create: `src/components/InsightSlide.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/InsightSlide.tsx
"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import type { InsightSlide as InsightSlideType } from "@/types/dashboard";

interface InsightSlideProps {
  slide: InsightSlideType;
  /** Called when user clicks the download button (Phase 4 wires html2canvas) */
  onDownload?: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function InsightSlide({ slide, onDownload }: InsightSlideProps) {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#fff",
        borderColor: "rgba(0,0,0,0.08)",
        borderWidth: 1,
        titleColor: "#1e293b",
        bodyColor: "#475569",
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#94a3b8", font: { size: 10 } },
        border: { color: "transparent" },
      },
      y: {
        grid: { color: "rgba(0,0,0,0.04)" },
        ticks: { color: "#94a3b8", font: { size: 10 } },
        border: { color: "transparent" },
      },
    },
  };

  // Inject default colours if datasets don't have them
  const colouredCharts = slide.charts.map((chart) => ({
    ...chart,
    data: {
      ...chart.data,
      datasets: chart.data.datasets.map((ds, i) => ({
        ...ds,
        backgroundColor: ds.backgroundColor ?? (
          chart.type === "doughnut"
            ? ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"]
            : `rgba(${i === 0 ? "99,102,241" : "14,165,233"},0.75)`
        ),
        borderColor: ds.borderColor ?? (i === 0 ? "#6366f1" : "#0ea5e9"),
        borderWidth: 2,
      })),
    },
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass-slide p-5 space-y-4"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-sky-500">
            ◈ Insight Slide
          </span>
          <span className="text-[10px] text-text-muted">
            {formatTime(slide.createdAt)}
          </span>
        </div>
        {onDownload && (
          <button
            onClick={onDownload}
            className="text-[10px] text-text-muted hover:text-accent transition-colors"
            title="Download as PNG"
          >
            ⬇ Save
          </button>
        )}
      </div>

      {/* Question pill */}
      <div className="inline-block bg-sky-500/10 border border-sky-500/20 rounded-full px-3 py-1">
        <p className="text-[11px] text-sky-700 italic">"{slide.question}"</p>
      </div>

      {/* Headline */}
      <h3 className="text-base font-bold text-text-primary leading-snug">
        {slide.headline}
      </h3>

      {/* Charts */}
      {colouredCharts.length > 0 && (
        <div className={`grid gap-4 ${colouredCharts.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {colouredCharts.map((chart, i) => (
            <div key={i} className="bg-white/50 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-text-muted mb-2 uppercase tracking-wider">
                {chart.title}
              </p>
              <div className="h-36">
                {chart.type === "line" && (
                  <Line data={chart.data} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: colouredCharts.length === 1 } } } as any} />
                )}
                {chart.type === "bar" && (
                  <Bar data={chart.data} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: colouredCharts.length === 1 } } } as any} />
                )}
                {chart.type === "doughnut" && (
                  <Doughnut data={chart.data} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "right", labels: { color: "#475569", font: { size: 10 }, boxWidth: 10 } }, tooltip: chartOptions.plugins.tooltip } } as any} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bullets */}
      <ul className="space-y-2">
        {slide.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
            <span className="text-sky-500 font-bold mt-0.5 shrink-0">→</span>
            {bullet}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/InsightSlide.tsx
git commit -m "feat(slides): InsightSlide component with charts + bullets"
```

---

### Task 25: Update ChatPanel to render InsightSlide and save to DB

**Files:**
- Modify: `src/components/ChatPanel.tsx`

- [ ] **Step 1: Update props interface**

```tsx
interface ChatPanelProps {
  dataSummary: string;
  currentConfig: DashboardConfig;
  onRefresh: (config: DashboardConfig) => void;
  sessionId?: string;           // used to save slides to DB
  onSlideAdded?: (slide: InsightSlideType) => void;  // tells parent to add slide to list
}
```

Add import:
```tsx
import InsightSlide from "./InsightSlide";
import type { InsightSlide as InsightSlideType } from "@/types/dashboard";
import { getDeviceId } from "@/lib/device-id";
```

- [ ] **Step 2: Update `sendMessage` to handle `type: "slide"` response**

Replace the existing response handling in `sendMessage` with:

```ts
const result = await res.json();

if (result.type === "slide" && result.slide) {
  const slide: InsightSlideType = {
    ...result.slide,
    sessionId: sessionId ?? "",
  };

  // Save to DB (best-effort)
  if (sessionId) {
    const deviceId = getDeviceId();
    fetch(`/api/sessions/${sessionId}/slides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, slide }),
    }).catch(console.warn);
  }

  onSlideAdded?.(slide);
  // Add a minimal text confirmation to the chat bubble
  setMessages(prev => [
    ...prev,
    { role: "assistant", content: "↑ Insight slide generated above.", isRefresh: false },
  ]);
} else if (result.type === "refresh" && result.config) {
  onRefresh(result.config);
  setMessages(prev => [
    ...prev,
    { role: "assistant", content: "Dashboard updated.", isRefresh: true },
  ]);
} else {
  setMessages(prev => [
    ...prev,
    { role: "assistant", content: result.text ?? "I couldn't generate a response." },
  ]);
}
```

- [ ] **Step 3: Update the fetch body to send `sessionId`**

```ts
body: JSON.stringify({ question, dataSummary, currentConfig, sessionId }),
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ChatPanel.tsx
git commit -m "feat(slides): ChatPanel renders InsightSlide, saves to DB"
```

---

### Task 26: Wire slides into Dashboard and session page

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/app/session/[id]/page.tsx`

- [ ] **Step 1: Add slide state to Dashboard**

Update `DashboardProps`:
```tsx
interface DashboardProps {
  data: DashboardConfig;
  dataSummary: string;
  onReset: () => void;
  sessionId?: string;
  initialSlides?: InsightSlideType[];
}
```

Add import: `import InsightSlide from "./InsightSlide";` and `import type { InsightSlide as InsightSlideType } from "@/types/dashboard";`

Add state: `const [slides, setSlides] = useState<InsightSlideType[]>(initialSlides ?? []);`

- [ ] **Step 2: Add Insight Slides section to Dashboard JSX — place it between the charts grid and the ChatPanel**

```tsx
{/* Insight Slides */}
{slides.length > 0 && (
  <div className="space-y-4">
    <p className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
      Insight Slides — from your questions
    </p>
    {slides.map((slide, i) => (
      <InsightSlide key={slide.id ?? i} slide={slide} />
    ))}
  </div>
)}

{/* Chat bar */}
<ChatPanel
  dataSummary={dataSummary}
  currentConfig={currentConfig}
  onRefresh={setCurrentConfig}
  sessionId={sessionId}
  onSlideAdded={(slide) => setSlides(prev => [...prev, slide])}
/>
```

- [ ] **Step 3: Update session/[id]/page.tsx to load and pass slides**

Replace the state and effect in the session page:

```tsx
const [config, setConfig] = useState<DashboardConfig | null>(null);
const [slides, setSlides] = useState<InsightSlideType[]>([]);
```

In the fetch effect, after setting config:
```ts
.then((body) => {
  if (body.error) throw new Error(body.error);
  setConfig(body.session.dashboard as DashboardConfig);
  // Map stored slides from DB row shape to InsightSlide shape
  const stored = (body.slides ?? []).map((row: any) => ({
    id: row.id,
    sessionId: row.session_id,
    question: row.question,
    ...row.slide,
  } as InsightSlideType));
  setSlides(stored);
})
```

Pass to Dashboard:
```tsx
<Dashboard
  data={config}
  dataSummary={dataSummary}
  onReset={() => router.push("/")}
  sessionId={sessionId}
  initialSlides={slides}
/>
```

Add import: `import type { InsightSlide as InsightSlideType } from "@/types/dashboard";`

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: End-to-end test for insight slides**

1. Open a session from the Home screen
2. Type a question in the chat bar: "What are the top defect types?"
3. Verify: a slide with headline, 1-2 charts, and 3-4 bullets appears above the chat bar
4. Refresh the page — slide should reload from Supabase

- [ ] **Step 6: Commit**

```bash
git add src/components/Dashboard.tsx "src/app/session/[id]/page.tsx"
git commit -m "feat(slides): insight slides rendered in dashboard, persist and reload from DB"
```

---

### Task 27: Update session cards to show slide count

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update sessions fetch to include slide count**

Update the `GET /api/sessions` route to include a count query, OR do a simple join. The easiest approach is to update the route to select slide counts. Update `src/app/api/sessions/route.ts`:

```ts
// Replace the select call with a join that counts slides:
const { data, error } = await db
  .from("sessions")
  .select("id, title, files, dashboard, created_at, insight_slides(count)")
  .eq("device_id", deviceId)
  .order("created_at", { ascending: false })
  .limit(20);
```

In `src/app/page.tsx`, update the mapping:
```ts
slideCount: (s.insight_slides?.[0]?.count as number) ?? 0,
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/api/sessions/route.ts src/app/page.tsx
git commit -m "feat(slides): show insight slide count on session cards"
```

---

### Task 28: Phase 3 build check

- [ ] **Step 1: Full TypeScript + build**

```bash
npx tsc --noEmit && npm run build
```

Expected: No errors.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(phase-3): insight slides complete"
```

---

## PHASE 4 — Export

---

### Task 29: Add print stylesheet

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Append print styles to the end of globals.css**

```css
/* ── Print styles ─────────────────────────────────────────────────────── */
@media print {
  html {
    background: #ffffff !important;
    background-attachment: initial !important;
  }

  body {
    background: #ffffff !important;
    color: #1e293b !important;
  }

  /* Reset all glass effects for print */
  .glass,
  .glass-card,
  .glass-tinted,
  .glass-slide,
  .glass-summary,
  .topbar {
    background: #ffffff !important;
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    border: 1px solid #e2e8f0 !important;
    box-shadow: none !important;
  }

  /* Hide interactive elements */
  .topbar button,
  form,
  [data-no-print] {
    display: none !important;
  }

  /* Page break before each insight slide */
  .glass-slide {
    page-break-before: auto;
    break-inside: avoid;
  }
}
```

- [ ] **Step 2: Test print preview**

In browser: `Ctrl+P` (or `Cmd+P`). Verify background is white, glass effects are removed, buttons are hidden.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(export): print stylesheet for full session PDF export"
```

---

### Task 30: Install html2canvas and add per-slide PNG download

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/components/InsightSlide.tsx`
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Install html2canvas**

```bash
npm install html2canvas
```

Expected: Package added to `node_modules`. `package.json` updated.

- [ ] **Step 2: Add `data-no-print` to the ChatPanel wrapper in Dashboard.tsx**

This hides the chat input from print:
```tsx
<div data-no-print>
  <ChatPanel ... />
</div>
```

- [ ] **Step 3: Update InsightSlide.tsx to wire the download button with html2canvas**

Add a `ref` to the slide wrapper and update the `onDownload` default handler:

```tsx
import html2canvas from "html2canvas";

// Inside InsightSlide component:
const slideRef = useRef<HTMLDivElement>(null);

const handleDownload = async () => {
  if (!slideRef.current) return;
  try {
    const canvas = await html2canvas(slideRef.current, {
      backgroundColor: "#f0f4ff",
      scale: 2,        // retina resolution
      useCORS: true,
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    const slug = slide.question
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40);
    const date = new Date().toISOString().slice(0, 10);
    a.download = `rais-insight-${slug}-${date}.png`;
    a.click();
  } catch (err) {
    console.error("Export failed:", err);
  }
};
```

Add `ref={slideRef}` to the outermost `motion.div`.

Pass `onDownload={handleDownload}` from the component itself (self-contained, no prop needed):

Update the button in JSX:
```tsx
<button
  onClick={handleDownload}
  className="text-[10px] text-text-muted hover:text-accent transition-colors"
  title="Download as PNG"
>
  ⬇ Save
</button>
```

Remove the `onDownload` prop from the interface — the component handles it internally.

- [ ] **Step 4: Add type declaration if needed**

```bash
npm install --save-dev @types/html2canvas 2>/dev/null || true
```

If `@types/html2canvas` is not available, add a minimal declaration in `src/types/html2canvas.d.ts`:
```ts
declare module "html2canvas" {
  function html2canvas(
    element: HTMLElement,
    options?: {
      backgroundColor?: string;
      scale?: number;
      useCORS?: boolean;
    }
  ): Promise<HTMLCanvasElement>;
  export default html2canvas;
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Test the download**

1. Open a session with at least one insight slide
2. Click the "⬇ Save" button on the slide
3. A PNG file should download named `rais-insight-[slug]-[date].png`

- [ ] **Step 7: Commit**

```bash
git add src/components/InsightSlide.tsx src/components/Dashboard.tsx package.json package-lock.json src/types/
git commit -m "feat(export): per-slide PNG download via html2canvas"
```

---

### Task 31: Final build and smoke test

- [ ] **Step 1: Full TypeScript check + production build**

```bash
npx tsc --noEmit && npm run build
```

Expected: Zero TypeScript errors. Production build completes.

- [ ] **Step 2: Full smoke test checklist**

- [ ] Home screen shows gradient background, RAIS gradient logo, welcome text
- [ ] Drop Excel file → Processing screen appears with indigo spinner
- [ ] Dashboard renders: glass exec summary, glass KPI cards, glass charts, insights, recommendations
- [ ] "← Home" navigates back; session appears in the Recent Sessions grid with KPI preview
- [ ] Click session card → loads from Supabase (no re-analysis)
- [ ] Ask a question in chat → insight slide appears with headline, chart(s), bullets
- [ ] Refresh page → insight slide still there (loaded from Supabase)
- [ ] Slide count on session card updates after generating slides
- [ ] "⬇ Save" on a slide downloads a PNG file
- [ ] `Ctrl+P` print preview shows white background, no glass effects, buttons hidden

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(phase-4): export complete — RAIS redesign + sessions + insight slides done"
```

---

## Appendix: Environment Variables Required

Add these to `.env.local` before starting development:

```
# Existing
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=sk-or-...
GROQ_API_KEY=gsk_...
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# New (Phase 2)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`SUPABASE_SERVICE_ROLE_KEY` is found in Supabase dashboard → Project Settings → API → `service_role` (secret) key. Never expose this to the browser — it's only used in Next.js API routes (server-side).

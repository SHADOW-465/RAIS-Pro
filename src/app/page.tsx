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

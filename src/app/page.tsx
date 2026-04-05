// src/app/page.tsx
"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import UploadZone from "@/components/UploadZone";
import ProcessingLoader from "@/components/ProcessingLoader";
import Dashboard from "@/components/Dashboard";
import type { DashboardConfig } from "@/types/dashboard";

export type AppState = "upload" | "processing" | "dashboard";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("upload");
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
      setAppState("upload");
      alert("Intelligence Scan Failed. Check your API configuration and try again.");
    }
  };

  const handleReset = () => {
    setAppState("upload");
    setAnalysisData(null);
    setDataSummary("");
  };

  return (
    <main className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center">
      <AnimatePresence mode="wait">
        {appState === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-4xl"
          >
            <UploadZone onUpload={handleUploadComplete} />
          </motion.div>
        )}

        {appState === "processing" && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <ProcessingLoader />
          </motion.div>
        )}

        {appState === "dashboard" && analysisData && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="w-full"
          >
            <Dashboard
              data={analysisData}
              dataSummary={dataSummary}
              onReset={handleReset}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

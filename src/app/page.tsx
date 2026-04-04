"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import UploadZone from "@/components/UploadZone";
import ProcessingLoader from "@/components/ProcessingLoader";
import Dashboard from "@/components/Dashboard";
import StatusAlert from "@/components/StatusAlert";
import type { AnalysisResult } from "@/lib/types";
import { parseExcelFiles } from "@/lib/parser";
import { runAnalysis, AnalysisError } from "@/lib/analyzer";

export type AppState = "upload" | "processing" | "dashboard";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [analysisData, setAnalysisData] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUploadComplete = async (files: File[]) => {
    setAppState("processing");
    setErrorMessage(null);
    try {
      const summaries = await parseExcelFiles(files);
      const sourceFiles = files.map((f) => f.name);
      const data = await runAnalysis(summaries, sourceFiles);
      setAnalysisData(data);
      setAppState("dashboard");
    } catch (err) {
      const message =
        err instanceof AnalysisError
          ? err.message
          : "An unexpected error occurred. Please try again.";
      console.error("Analysis failed:", err);
      setErrorMessage(message);
      setAppState("upload");
    }
  };

  const handleReset = () => {
    setAppState("upload");
    setAnalysisData(null);
    setErrorMessage(null);
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
            {errorMessage && (
              <div className="mb-6">
                <StatusAlert
                  message={errorMessage}
                  type="danger"
                  onClose={() => setErrorMessage(null)}
                />
              </div>
            )}
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
            <Dashboard data={analysisData} onReset={handleReset} />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

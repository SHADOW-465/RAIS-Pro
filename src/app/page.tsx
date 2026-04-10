// src/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import UploadZone from "@/components/UploadZone";
import ProcessingLoader from "@/components/ProcessingLoader";
import SessionCard, { type SessionSummary } from "@/components/SessionCard";
import { getDeviceId } from "@/lib/device-id";

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
      // 1. Parse Excel files client-side (no raw data leaves the browser)
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
        router.push(`/session/${body.sessionId}`);
      } else {
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

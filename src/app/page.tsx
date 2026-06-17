// src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadZone from "@/components/UploadZone";
import ProcessingLoader from "@/components/ProcessingLoader";
import SessionCard, { type SessionSummary } from "@/components/SessionCard";
import Dashboard from "@/components/Dashboard";
import EditorialHeader from "@/components/editorial/EditorialHeader";
import Icon from "@/components/editorial/Icon";
import StatusAlert from "@/components/StatusAlert";
import { getDeviceId } from "@/lib/device-id";
import type { DashboardConfig, RawSheet } from "@/types/dashboard";
import type { MergePlan } from "@/types/analysis";

export default function Home() {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<number>(0);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [analysisData, setAnalysisData] = useState<DashboardConfig | null>(null);
  const [dataSummary, setDataSummary] = useState<string>("");
  const [rawSheets, setRawSheets] = useState<RawSheet[]>([]);
  const [mergePlan, setMergePlan] = useState<MergePlan | undefined>(undefined);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [narrativePending, setNarrativePending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const deviceId = getDeviceId();
    if (!deviceId) {
      setLoadingSessions(false);
      return;
    }
    fetch(`/api/sessions?deviceId=${encodeURIComponent(deviceId)}`)
      .then((r) => r.json())
      .then((body) => {
        const raw = body.sessions ?? [];
        const mapped: SessionSummary[] = raw.map((s: any) => ({
          id: s.id,
          title: s.title,
          createdAt: s.created_at,
          fileNames: (s.files ?? []).map((f: any) => f.name ?? "file"),
          slideCount: (s.insight_slides?.[0]?.count as number) ?? 0,
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

  // Fire-and-forget: the slow AI prose fills into the already-rendered dashboard.
  // Bounded by a client timeout so a hung provider eventually clears the skeleton.
  const fetchNarrative = async (metrics: unknown, sid: string | null) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch("/api/narrative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics, sessionId: sid }),
        signal: controller.signal,
      });
      if (!res.ok) {
        setNarrativePending(false);
        return;
      }
      const prose = await res.json();
      setAnalysisData((prev) =>
        prev
          ? {
              ...prev,
              dashboardTitle: prose.dashboardTitle ?? prev.dashboardTitle,
              executiveSummary: prose.executiveSummary ?? "",
              insights: prose.insights ?? [],
              recommendations: prose.recommendations ?? [],
              alerts: prose.alerts ?? [],
            }
          : prev,
      );
      setNarrativePending(false);
    } catch {
      setNarrativePending(false);
    } finally {
      clearTimeout(timer);
    }
  };

  const handleUploadComplete = async (files: File[]) => {
    setProcessing(true);
    setProcessingStep(1); // 1. Reading spreadsheets
    setErrorState(null);
    try {
      const { parseExcelFilesWithRaw } = await import("@/lib/parser");
      const { summaries, rawSheets: sheets } = await parseExcelFilesWithRaw(files);

      setProcessingStep(2); // 2. Extracting data structures

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
      setProcessingStep(3); // 3. Computing metrics

      if (!body.dashboardTitle || !(body.kpis?.length)) {
        throw new Error(body.error ?? "Analysis returned no usable data");
      }

      const sid: string | null = body.sessionId ?? null;
      if (sid) {
        try {
          sessionStorage.setItem(`rais_raw_${sid}`, JSON.stringify(sheets));
        } catch {
          /* quota exceeded — silently skip */
        }
      }

      // Render the dashboard NOW with real numbers; prose streams in next.
      setRawSheets(sheets);
      setDataSummary(JSON.stringify(summaries));
      setMergePlan(body.mergePlan);
      setSessionId(sid);
      setNarrativePending(true);
      setAnalysisData(body as DashboardConfig);
      setProcessing(false);

      // Kick off the narrative fill (does not block the dashboard).
      void fetchNarrative(body.metrics, sid);
    } catch (error: any) {
      console.error("Analysis failed:", error);
      setProcessing(false);
      setProcessingStep(0);
      setErrorState(error.message ?? "Analysis failed. Please check your spreadsheet structure.");
    }
  };

  if (processing) {
    return <ProcessingLoader activeStep={processingStep} />;
  }

  if (analysisData) {
    return (
      <Dashboard
        data={analysisData}
        dataSummary={dataSummary}
        rawSheets={rawSheets}
        mergePlan={mergePlan}
        sessionId={sessionId ?? undefined}
        narrativePending={narrativePending}
        onReset={() => {
          setAnalysisData(null);
          setRawSheets([]);
          setMergePlan(undefined);
          setSessionId(null);
          setNarrativePending(false);
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <EditorialHeader />

      <div
        className="shell"
        style={{ paddingTop: 64, paddingBottom: 96, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}
      >
        <div style={{ maxWidth: 720, width: "100%", margin: "0 auto" }}>
          {/* Error Feedback Banner */}
          {errorState && (
            <div style={{ marginBottom: 32 }} className="fade-up">
              <StatusAlert
                message={errorState}
                type="danger"
                onClose={() => setErrorState(null)}
              />
            </div>
          )}

          {/* Dashboard-first cockpit shell (ingestion is a workflow, not a gate) */}
          <div style={{ textAlign: "center", marginBottom: 32 }} className="fade-up">
            <div className="eyebrow accent" style={{ fontSize: 11, fontWeight: 700 }}>Quality Intelligence</div>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 38,
                fontWeight: 800,
                margin: "8px 0 10px",
                letterSpacing: "-0.03em",
                color: "var(--text)",
              }}
            >
              Rejection cockpit
            </h1>
            <p className="muted" style={{ fontSize: 15, maxWidth: 560, margin: "0 auto", lineHeight: 1.6 }}>
              What failed, where it came from, and what to do about it — every number traceable
              to its source. Bring in rejection data to begin.
            </p>
          </div>

          {/* Primary action → ingestion pipeline */}
          <div className="fade-up" style={{ marginBottom: 48, display: "flex", justifyContent: "center", gap: 12 }}>
            <button
              onClick={() => router.push("/ingest")}
              style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 12, padding: "14px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Icon name="upload" size={16} /> Ingest rejection data
            </button>
          </div>

          {/* Recent sessions */}
          {!loadingSessions && sessions.length > 0 && (
            <div className="mt-8 fade-up">
              <div
                className="between mb-4"
                style={{ alignItems: "flex-end" }}
              >
                <div>
                  <div className="eyebrow accent" style={{ fontSize: 11, fontWeight: 700 }}>Archive</div>
                  <h2
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 24,
                      margin: "4px 0 0",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      color: "var(--text)",
                    }}
                  >
                    Recent diagnostics
                  </h2>
                </div>
                <button
                  className="btn ghost sm"
                  style={{ border: "none", background: "transparent", cursor: "pointer" }}
                >
                  View all <Icon name="arrow-right" size={12} />
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 16,
                }}
              >
                {sessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onClick={() => router.push(`/session/${s.id}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state for sessions */}
          {!loadingSessions && sessions.length === 0 && (
            <div
              className="fade-up"
              style={{
                marginTop: 48,
                borderTop: "1px solid var(--border)",
                paddingTop: 32,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  background: "var(--surface-2)",
                  color: "var(--text-3)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 12,
                }}
              >
                <Icon name="file" size={20} />
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16,
                  fontWeight: 700,
                  margin: "0 0 4px",
                  color: "var(--text)",
                }}
              >
                No recent diagnostics
              </h3>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Previously run analysis briefs will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

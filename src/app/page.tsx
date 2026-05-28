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
import { getDeviceId } from "@/lib/device-id";
import type { DashboardConfig, RawSheet } from "@/types/dashboard";
import type { MergePlan } from "@/types/analysis";

export default function Home() {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [analysisData, setAnalysisData] = useState<DashboardConfig | null>(null);
  const [dataSummary, setDataSummary] = useState<string>("");
  const [rawSheets, setRawSheets] = useState<RawSheet[]>([]);
  const [mergePlan, setMergePlan] = useState<MergePlan | undefined>(undefined);

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

  const handleUploadComplete = async (files: File[]) => {
    setProcessing(true);
    try {
      const { parseExcelFilesWithRaw } = await import("@/lib/parser");
      const { summaries, rawSheets: sheets } = await parseExcelFilesWithRaw(files);

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
        try {
          sessionStorage.setItem(
            `rais_raw_${body.sessionId}`,
            JSON.stringify(sheets),
          );
        } catch {
          /* quota exceeded — silently skip */
        }
        router.push(`/session/${body.sessionId}`);
      } else if (body.dashboardTitle) {
        setRawSheets(sheets);
        setDataSummary(JSON.stringify(summaries));
        setMergePlan(body.mergePlan);
        setAnalysisData(body as DashboardConfig);
        setProcessing(false);
      } else {
        throw new Error(body.error ?? "Analysis returned no usable data");
      }
    } catch (error) {
      console.error("Analysis failed:", error);
      setProcessing(false);
      alert("Analysis failed. Check your API configuration and try again.");
    }
  };

  if (processing) return <ProcessingLoader />;

  if (analysisData) {
    return (
      <Dashboard
        data={analysisData}
        dataSummary={dataSummary}
        rawSheets={rawSheets}
        mergePlan={mergePlan}
        onReset={() => {
          setAnalysisData(null);
          setRawSheets([]);
          setMergePlan(undefined);
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <EditorialHeader />

      <div
        className="shell"
        style={{ paddingTop: 56, paddingBottom: 80, flex: 1 }}
      >
        {/* Greeting */}
        <div className="mb-12">
          <div className="eyebrow accent">Morning briefing</div>
          <h1
            className="serif tracked-tight"
            style={{
              fontSize: 64,
              fontWeight: 500,
              margin: "12px 0 6px",
              letterSpacing: "-0.03em",
            }}
          >
            Good morning.
          </h1>
          <p
            className="muted"
            style={{ fontSize: 17, maxWidth: 620, marginTop: 0 }}
          >
            Drop in this cycle&apos;s plant reports and you&apos;ll have an
            executive read in under thirty seconds. Or pick up where you left
            off below.
          </p>
        </div>

        {/* Upload */}
        <UploadZone onUpload={handleUploadComplete} />

        {/* Recent sessions */}
        {!loadingSessions && sessions.length > 0 && (
          <div className="mt-12">
            <div
              className="between mb-4"
              style={{ alignItems: "flex-end" }}
            >
              <div>
                <div className="eyebrow accent">Archive</div>
                <h2
                  className="serif tracked-tight"
                  style={{
                    fontSize: 30,
                    margin: "6px 0 0",
                    fontWeight: 500,
                  }}
                >
                  Recent diagnostics
                </h2>
              </div>
              <button className="btn ghost sm">
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
      </div>
    </div>
  );
}

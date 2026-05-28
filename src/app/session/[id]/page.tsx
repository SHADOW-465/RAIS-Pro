// src/app/session/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import ProcessingLoader from "@/components/ProcessingLoader";
import { getDeviceId } from "@/lib/device-id";
import type { DashboardConfig, RawSheet } from "@/types/dashboard";
import type { InsightSlide as InsightSlideType } from "@/types/dashboard";
import type { MergePlan } from "@/types/analysis";

interface Props {
  params: Promise<{ id: string }>;
}

export default function SessionPage({ params }: Props) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>("");
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [dataSummary, setDataSummary] = useState<string>("");
  const [slides, setSlides] = useState<InsightSlideType[]>([]);
  const [rawSheets, setRawSheets] = useState<RawSheet[]>([]);
  const [mergePlan, setMergePlan] = useState<MergePlan | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      setSessionId(id);
      // Restore raw sheets stashed in sessionStorage right after upload
      try {
        const stored = sessionStorage.getItem(`rais_raw_${id}`);
        if (stored) setRawSheets(JSON.parse(stored));
      } catch { /* ignore */ }
    });
  }, [params]);

  useEffect(() => {
    if (!sessionId) return;
    const deviceId = getDeviceId();

    fetch(`/api/sessions/${sessionId}?deviceId=${encodeURIComponent(deviceId)}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setConfig(body.session.dashboard as DashboardConfig);
        if (body.session.merge_plan) setMergePlan(body.session.merge_plan as MergePlan);
        if (body.session.data_summary) setDataSummary(body.session.data_summary);
        // Map stored slides from DB row shape to InsightSlide shape
        const stored = (body.slides ?? []).map((row: any) => ({
          id: row.id,
          sessionId: row.session_id,
          question: row.question,
          ...row.slide,
        } as InsightSlideType));
        setSlides(stored);
      })
      .catch((err) => setError(err.message));
  }, [sessionId]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div
          className="card"
          style={{ maxWidth: 480, textAlign: "center", padding: 36 }}
        >
          <div className="eyebrow accent" style={{ marginBottom: 8 }}>Error</div>
          <h2 className="serif tracked-tight" style={{ fontSize: 26, fontWeight: 500, margin: "0 0 12px" }}>
            Could not load session
          </h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>{error}</p>
          <button onClick={() => router.push("/")} className="btn primary">
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  if (!config) {
    return <ProcessingLoader />;
  }

  return (
    <Dashboard
      data={config}
      dataSummary={dataSummary}
      onReset={() => router.push("/")}
      sessionId={sessionId}
      initialSlides={slides}
      rawSheets={rawSheets.length > 0 ? rawSheets : undefined}
      mergePlan={mergePlan}
    />
  );
}

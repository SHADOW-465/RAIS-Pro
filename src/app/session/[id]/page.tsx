// src/app/session/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import ProcessingLoader from "@/components/ProcessingLoader";
import { getDeviceId } from "@/lib/device-id";
import type { DashboardConfig } from "@/types/dashboard";
import type { InsightSlide as InsightSlideType } from "@/types/dashboard";

interface Props {
  params: Promise<{ id: string }>;
}

export default function SessionPage({ params }: Props) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string>("");
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [dataSummary] = useState<string>(""); // Phase 3: loaded from session
  const [slides, setSlides] = useState<InsightSlideType[]>([]);
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
      sessionId={sessionId}
      initialSlides={slides}
    />
  );
}

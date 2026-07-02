"use client";

import { useEffect, useState } from "react";
import { Empty } from "@/components/app/widgets";
import PageLoader from "@/components/app/PageLoader";
import GenericDashboardBody from "@/components/app/GenericDashboardBody";
import { buildGenericDashboard } from "@/lib/dataset/dashboard";
import { toStageRecords } from "@/lib/dataset/to-stage-records";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import { useEvents } from "@/components/app/EventsContext";
import type { Dataset, DatasetRow } from "@/lib/dataset/types";

/** Renders any persisted Dataset generically — KPIs from measure columns, a
 *  trend per KPI when a date dimension exists, breakdowns per dimension column,
 *  and a defect Pareto when defect columns exist. Used for datasets that are
 *  NOT (yet) recognized as a known Disposafe stage — see spec component [F1].
 *  Fetches its own data (dataset metadata + rows) so it stays fully decoupled
 *  from AppShell's tab list, which only needs id/title to render the tab. */
export default function GenericDatasetView({ datasetId }: { datasetId: string }) {
  const { refreshEvents } = useEvents();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [rows, setRows] = useState<DatasetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function publishToCumulative(ds: Dataset, dsRows: DatasetRow[]) {
    setPublishing(true);
    setPublishMsg(null);
    try {
      const ingestionId = globalThis.crypto?.randomUUID?.() ?? `ing-${Date.now()}`;
      const records = toStageRecords(ds, dsRows, ingestionId);
      if (records.length === 0) {
        setPublishMsg({ tone: "err", text: "Nothing to publish — no rows with a valid date." });
        return;
      }
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName: ds.title, records }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Ingest failed (${res.status})`);
      const issues = (json.issues ?? []).length;
      setPublishMsg({
        tone: "ok",
        text: `Published ${records.length} records — ${json.inserted} new, ${json.deduped} already present${issues ? `, ${issues} clarification${issues === 1 ? "" : "s"} raised` : ""}.`,
      });
      refreshEvents();
    } catch (err: unknown) {
      setPublishMsg({ tone: "err", text: err instanceof Error ? err.message : "Publish failed" });
    } finally {
      setPublishing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setDataset(null);
    setRows(null);
    setError(null);
    setLoaded(false);
    Promise.all([
      fetch("/api/datasets").then((r) => {
        if (!r.ok) throw new Error(`Failed to load datasets (${r.status})`);
        return r.json();
      }),
      fetch(`/api/datasets?datasetId=${encodeURIComponent(datasetId)}`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load dataset rows (${r.status})`);
        return r.json();
      }),
    ])
      .then(([listJson, rowsJson]) => {
        if (cancelled) return;
        const found = ((listJson.datasets ?? []) as Dataset[]).find((d) => d.id === datasetId) ?? null;
        setDataset(found);
        setRows((rowsJson.rows ?? []) as DatasetRow[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? "Failed to load dataset");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  if (error) return <Empty label={`Could not load this dataset: ${error}`} />;
  if (!loaded) return <PageLoader message="Loading dataset..." minHeight="40vh" />;
  if (!dataset || rows === null) {
    return <Empty label="This dataset no longer exists — it may have been cleared. Try refreshing the View list." />;
  }

  const d = buildGenericDashboard(dataset, rows);

  const stageLabel = dataset.recognizedStageId
    ? DISPOSAFE_REGISTRY.stages.find((s) => s.stageId === dataset.recognizedStageId)?.label ?? dataset.recognizedStageId
    : null;

  return (
    <GenericDashboardBody
      d={d}
      publishBanner={
        stageLabel
          ? {
              stageLabel,
              publishing,
              onPublish: () => publishToCumulative(dataset, rows),
              message: publishMsg,
            }
          : undefined
      }
    />
  );
}

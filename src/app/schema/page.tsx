"use client";

// Data Schema — a viewable map of how the app's data connects: inspection stages
// (with their FBC P-codes + upstream flow) and the defect catalog. Reflects the
// live registry (staging-extracted schema) when configured, else the default.

import { useEffect, useState } from "react";
import AppShell from "@/components/app/AppShell";
import { Card } from "@/components/app/widgets";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import { STAGE_TO_PCODE } from "@/lib/registry/fbc-process";

interface Stage { stageId: string; label: string; upstream?: string[] }
interface Defect { defectCode: string; label: string; stages: string[] }

export default function SchemaPage() {
  const [reg, setReg] = useState<{ stages: Stage[]; defects: Defect[] }>({ stages: DISPOSAFE_REGISTRY.stages as Stage[], defects: DISPOSAFE_REGISTRY.defects as Defect[] });
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/schema")
      .then((r) => r.json())
      .then((b) => {
        if (b.registry) setReg({ stages: b.registry.stages ?? [], defects: b.registry.defects ?? [] });
        setConfigured(!!b.configured);
      })
      .catch(() => {});
  }, []);

  return (
    <AppShell active="schema">
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, margin: "0 0 4px", color: "var(--text)" }}>Data Schema</h1>
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            How the ledger connects — inspection stages, their process-flow bindings, and the defect catalog.{" "}
            {configured ? "Showing your uploaded schema." : "Showing the default Disposafe registry (upload via Staging to customise)."}
          </p>
        </div>

        <Card title="Inspection Stages (process flow)">
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                <th style={th}>Stage Id</th><th style={th}>Label</th><th style={th}>FBC Step</th><th style={th}>Feeds From</th>
              </tr>
            </thead>
            <tbody>
              {reg.stages.map((s) => (
                <tr key={s.stageId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{s.stageId}</td>
                  <td style={td}>{s.label}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{STAGE_TO_PCODE[s.stageId] ?? "—"}</td>
                  <td style={{ ...td, color: "var(--text-2)" }}>{(s.upstream ?? []).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Defect Catalog">
          <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase" }}>
                <th style={th}>Code</th><th style={th}>Label</th><th style={th}>Reported At Stages</th>
              </tr>
            </thead>
            <tbody>
              {reg.defects.map((d) => (
                <tr key={d.defectCode} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{d.defectCode}</td>
                  <td style={td}>{d.label}</td>
                  <td style={{ ...td, color: "var(--text-2)" }}>{(d.stages ?? []).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}

const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "8px 10px", color: "var(--text)" };

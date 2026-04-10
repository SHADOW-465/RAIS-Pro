// src/components/Dashboard.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Download, RefreshCw, Layers, Info } from "lucide-react";
import KPICard from "./KPICard";
import ChartContainer from "./ChartContainer";
import StatusAlert from "./StatusAlert";
import ChatPanel from "./ChatPanel";
import type { DashboardConfig } from "@/types/dashboard";

interface DashboardProps {
  data: DashboardConfig;
  dataSummary: string;
  onReset: () => void;
  sessionTitle?: string;   // Phase 2: shown in breadcrumb
}

export default function Dashboard({ data, dataSummary, onReset, sessionTitle }: DashboardProps) {
  const [currentConfig, setCurrentConfig] = useState<DashboardConfig>(data);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 },
    },
  };

  return (
    <div className="min-h-screen">
      {/* ── Sticky topbar ──────────────────────────────────── */}
      <header className="topbar sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={onReset}
            className="text-accent font-semibold hover:underline"
          >
            ← Home
          </button>
          <span className="text-text-muted">/</span>
          <span className="font-bold text-text-primary truncate max-w-[320px]">
            {sessionTitle || currentConfig.dashboardTitle || "Analysis"}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button onClick={() => window.print()} className="btn-ghost flex items-center gap-2">
            <Download size={14} />
            Export
          </button>
          <button onClick={onReset} className="btn-primary flex items-center gap-2">
            <RefreshCw size={14} />
            New Analysis
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Alerts */}
          {(currentConfig.alerts ?? []).map((alert, i) => (
            <StatusAlert key={i} message={alert} type="danger" />
          ))}

          {/* Executive Summary */}
          <motion.div variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}>
            <div className="glass-summary p-6 space-y-3">
              <div className="flex items-center gap-2 text-accent text-[10px] font-bold uppercase tracking-widest">
                <Layers size={12} /> Executive Summary
              </div>
              <p className="text-base font-medium text-text-primary leading-relaxed">
                {currentConfig.executiveSummary}
              </p>
            </div>
          </motion.div>

          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(currentConfig.kpis ?? []).length === 0 ? (
              <div className="col-span-4 text-text-muted text-sm text-center py-4">
                No key metrics identified
              </div>
            ) : (
              currentConfig.kpis.map((kpi, i) => (
                <KPICard key={i} kpi={kpi} />
              ))
            )}
          </div>

          {/* Chart Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(currentConfig.charts ?? []).map((chart, i) => (
              <ChartContainer
                key={i}
                title={chart.title}
                description={chart.description}
                type={chart.type}
                data={chart.data}
              />
            ))}
          </div>

          {/* Insights & Recommendations */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="lg:col-span-2 glass-card p-6 space-y-5"
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                <Info size={12} className="text-accent" /> Key Insights
              </h3>
              <div className="space-y-4">
                {(currentConfig.insights ?? []).map((insight, idx) => (
                  <div key={idx} className="flex gap-4 items-start">
                    <span className="text-accent/40 font-mono text-base font-bold shrink-0">
                      0{idx + 1}
                    </span>
                    <p className="text-sm text-text-secondary leading-relaxed">{insight}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="glass-tinted p-6 space-y-4"
            >
              <h3 className="text-xs font-bold uppercase tracking-widest text-accent">
                Recommendations
              </h3>
              <ul className="space-y-3">
                {(currentConfig.recommendations ?? []).map((rec, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-text-primary">
                    <span className="text-warning mt-0.5 shrink-0">→</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>

          {/* Chat Panel */}
          <ChatPanel
            dataSummary={dataSummary}
            currentConfig={currentConfig}
            onRefresh={setCurrentConfig}
          />

          {/* Data sources footer */}
          <div className="flex flex-wrap gap-2 pt-8 border-t border-white/40">
            <span className="text-[10px] text-text-muted mr-2 font-semibold uppercase tracking-wider">Sources:</span>
            <span className="text-[10px] bg-white/50 border border-white/70 rounded-full px-3 py-1 text-text-muted">
              RAIS Analysis
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

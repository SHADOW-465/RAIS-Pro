// src/components/Dashboard.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Download, RefreshCw, Layers, Zap, Info } from "lucide-react";
import KPICard from "./KPICard";
import ChartContainer from "./ChartContainer";
import StatusAlert from "./StatusAlert";
import ChatPanel from "./ChatPanel";
import type { DashboardConfig } from "@/types/dashboard";

interface DashboardProps {
  data: DashboardConfig;
  dataSummary: string;
  onReset: () => void;
}

export default function Dashboard({ data, dataSummary, onReset }: DashboardProps) {
  const [currentConfig, setCurrentConfig] = useState<DashboardConfig>(data);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.3 }
    }
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-1000">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 glass backdrop-blur-3xl px-8 py-4 -mx-8 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-accent-gradient rounded-lg flex items-center justify-center text-background">
            <Zap size={24} />
          </div>
          <div>
            <h1 className="text-xl font-display font-medium text-text-primary tracking-tight">
              {currentConfig.dashboardTitle || "Data Analysis"}
            </h1>
            <p className="text-[10px] text-text-muted font-mono uppercase tracking-[0.2em]">
              RAIS · Intelligence Status: OPTIMAL
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onReset} className="btn-secondary flex items-center gap-2 group">
            <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
            New Analysis
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => window.print()}>
            <Download size={16} />
            Export
          </button>
        </div>
      </header>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        {/* Alerts */}
        {(currentConfig.alerts ?? []).map((alert, i) => (
          <StatusAlert key={i} message={alert} type="danger" />
        ))}

        {/* Executive Summary */}
        <motion.div variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}>
          <div className="glass-card p-1 pb-0 bg-accent/20">
            <div className="bg-surface p-8 space-y-4">
              <div className="flex items-center gap-2 text-accent font-bold uppercase tracking-widest text-xs">
                <Layers size={14} /> Executive Summary
              </div>
              <p className="text-2xl font-display font-light text-text-primary leading-snug">
                {currentConfig.executiveSummary}
              </p>
            </div>
          </div>
        </motion.div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {(currentConfig.charts ?? []).map((chart, i) => (
            <ChartContainer key={i} title={chart.title} type={chart.type} data={chart.data} />
          ))}
        </div>

        {/* Insights & Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="lg:col-span-2 glass-card p-8 space-y-6"
          >
            <h3 className="text-lg font-display flex items-center gap-3">
              <Info className="text-accent" /> Key Intelligence Insights
            </h3>
            <div className="space-y-6">
              {(currentConfig.insights ?? []).map((insight, idx) => (
                <div key={idx} className="flex gap-6 items-start group">
                  <span className="font-mono text-accent/40 text-xl font-bold">0{idx + 1}</span>
                  <p className="text-text-secondary leading-relaxed group-hover:text-text-primary transition-colors">
                    {insight}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="glass-card p-8 bg-accent/5 border-accent/20 space-y-6"
          >
            <h3 className="text-lg font-display text-accent font-bold">Recommendations</h3>
            <ul className="space-y-4">
              {(currentConfig.recommendations ?? []).map((rec, i) => (
                <li key={i} className="flex gap-3 text-sm text-text-primary">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
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

        {/* Footer */}
        <div className="flex flex-wrap gap-3 pt-12 border-t border-border opacity-40">
          <span className="text-[10px] font-mono border border-white/20 px-2 py-1 rounded">
            RAIS Analysis
          </span>
        </div>
      </motion.div>
    </div>
  );
}

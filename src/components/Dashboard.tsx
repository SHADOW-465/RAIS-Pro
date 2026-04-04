"use client";

import { motion } from "framer-motion";
import { Download, RefreshCw, Layers, Zap, Info } from "lucide-react";
import KPICard from "./KPICard";
import ChartContainer from "./ChartContainer";
import StatusAlert from "./StatusAlert";
import ThemeToggle from "./ThemeToggle";
import type { AnalysisResult } from "@/lib/types";

interface DashboardProps {
  data: AnalysisResult;
  onReset: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function handleExport(data: AnalysisResult) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rais-analysis.json";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard({ data, onReset }: DashboardProps) {
  return (
    <div className="w-full space-y-8">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 glass backdrop-blur-3xl px-8 py-4 -mx-8 flex items-center justify-between border-b border-[var(--color-border)]">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 accent-gradient rounded-lg flex items-center justify-center text-background">
            <Zap size={24} />
          </div>
          <div>
            <h1 className="text-xl font-display font-medium text-text-primary tracking-tight">
              Manufacturing Performance Insight
            </h1>
            <p className="text-[10px] text-text-muted font-mono uppercase tracking-[0.2em]">
              Intelligence Status: OPTIMAL | Session ID: {data.id?.substring(0, 8) ?? "LOCAL"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button onClick={onReset} className="btn-secondary flex items-center gap-2 group">
            <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
            New Analysis
          </button>
          <button onClick={() => handleExport(data)} className="btn-primary flex items-center gap-2">
            <Download size={16} />
            Export
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        {/* Alerts Section */}
        {data.alerts?.map((alert, i) => (
          <StatusAlert key={i} message={alert.message} type={alert.type} />
        ))}

        {/* Executive Summary */}
        <motion.div variants={itemVariants}>
          <div className="glass-card p-1 pb-0" style={{ background: "color-mix(in srgb, var(--color-accent) 10%, transparent)" }}>
            <div className="bg-surface p-8 space-y-4 rounded-[calc(1rem-1px)]">
              <div className="flex items-center gap-2 text-accent font-bold uppercase tracking-widest text-xs">
                <Layers size={14} /> Executive Summary
              </div>
              <p className="text-2xl font-display font-light text-text-primary leading-snug">
                {data.executiveSummary}
              </p>
            </div>
          </div>
        </motion.div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard title="Rejection Rate" value={data.kpis.rejectionRate.value} unit={data.kpis.rejectionRate.unit ?? "%"} trend={data.kpis.rejectionRate.trend} context={data.kpis.rejectionRate.context} />
          <KPICard title="Total Output" value={data.kpis.totalOutput.value} unit={data.kpis.totalOutput.unit ?? "units"} trend={data.kpis.totalOutput.trend} context={data.kpis.totalOutput.context} />
          <KPICard title="Downtime" value={data.kpis.downtime.value} unit={data.kpis.downtime.unit ?? "m"} trend={data.kpis.downtime.trend} context={data.kpis.downtime.context} />
          <KPICard title="Quality Score" value={data.kpis.qualityScore.value} unit={data.kpis.qualityScore.unit ?? "%"} trend={data.kpis.qualityScore.trend} context={data.kpis.qualityScore.context} />
        </div>

        {/* Chart Grid */}
        {data.charts?.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {data.charts.map((chart, i) => (
              <ChartContainer key={i} title={chart.title} type={chart.type} data={chart.data} />
            ))}
          </div>
        )}

        {/* Intelligence Insights & Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div
            variants={itemVariants}
            className="lg:col-span-2 glass-card p-8 space-y-6"
          >
            <h3 className="text-lg font-display flex items-center gap-3 text-text-primary">
              <Info className="text-accent" /> Key Intelligence Insights
            </h3>
            <div className="space-y-6">
              {data.insights?.map((insight, idx) => (
                <div key={idx} className="flex gap-6 items-start group">
                  <span className="font-mono text-accent/40 text-xl font-bold shrink-0">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <p className="text-text-secondary leading-relaxed group-hover:text-text-primary transition-colors">
                    {insight}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="glass-card p-8 space-y-6"
            style={{ background: "color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))", borderColor: "color-mix(in srgb, var(--color-accent) 20%, transparent)" }}
          >
            <h3 className="text-lg font-display text-accent font-bold">Recommendations</h3>
            <ul className="space-y-4">
              {data.recommendations?.map((rec, i) => (
                <li key={i} className="flex gap-3 text-sm text-text-primary">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Source Files Footer */}
        {data.sourceFiles && data.sourceFiles.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-12 border-t border-[var(--color-border)] opacity-50">
            {data.sourceFiles.map((tag) => (
              <span key={tag} className="text-[10px] font-mono border border-[var(--color-border)] px-2 py-1 rounded text-text-muted">
                {tag}
              </span>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

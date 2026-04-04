"use client";

import { motion } from "framer-motion";
import { Download, RefreshCw, Layers, Zap, Info } from "lucide-react";
import KPICard from "./KPICard";
import ChartContainer from "./ChartContainer";
import StatusAlert from "./StatusAlert";

interface DashboardProps {
  data: any;
  onReset: () => void;
}

export default function Dashboard({ data, onReset }: DashboardProps) {
  // Use real data from analysis, fallback to mocks for demonstration if needed
  const displayData = data || {
    executiveSummary: "Production efficiency remains within target thresholds despite a localized rejection spike in Line 4. Overall quality score is up 4% MoM following the intelligence implementation.",
    kpis: {
      rejectionRate: { value: "2.4", trend: -12, context: "MoM Improvement" },
      totalOutput: { value: "14.2k", trend: 8.5, context: "Target Tracking" },
      downtime: { value: "18", trend: -4, context: "Last 24h" },
      qualityScore: { value: "98.2", trend: 0.5, context: "Stable" }
    },
    insights: [
      "Line 4 variability correlates with shift change latency at 14:00.",
      "Pressure sensor drift detected in pneumatic assembly unit B.",
      "Cooling cycle efficiency dropped by 3% in high-humidity periods.",
      "Raw material batch #A82 shows higher than average density variance.",
      "Operator efficiency peaks during the first 4 hours of the morning shift."
    ],
    recommendations: [
      "Initiate Line 4 Calibration scan",
      "Review pressure sensor logs (Q3)",
      "Optimize cooling cycle intervals",
      "Update morning QA checklist"
    ],
    alerts: [{ message: "Critical Rejection Spike detected in Line 4", type: "danger" }],
    charts: [
      { 
        title: "Efficiency Trend", 
        type: "line", 
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            label: 'Performance',
            data: [65, 59, 80, 81, 56, 95],
            borderColor: '#00E5CC',
            backgroundColor: 'rgba(0, 229, 204, 0.1)',
            fill: true,
            tension: 0.4,
          }]
        }
      },
      {
        title: "Resource Utilization",
        type: "bar",
        data: {
          labels: ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'],
          datasets: [{
            label: 'Utilization %',
            data: [88, 92, 85, 76, 90],
            backgroundColor: '#00E5CC',
          }]
        }
      }
    ]
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
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
              Manufacturing Performance Insight
            </h1>
            <p className="text-[10px] text-text-muted font-mono uppercase tracking-[0.2em]">
              Intelligence Status: OPTIMAL | Session ID: {data?.id?.substring(0,8) || 'LOCAL'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onReset} className="btn-secondary flex items-center gap-2 group">
            <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
            New Analysis
          </button>
          <button className="btn-primary flex items-center gap-2">
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
        {displayData.alerts?.map((alert: any, i: number) => (
          <StatusAlert key={i} message={alert.message} type={alert.type} />
        ))}

        {/* Executive Summary Section */}
        <motion.div variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}>
          <div className="glass-card p-1 pb-0 bg-accent/20">
            <div className="bg-surface p-8 space-y-4">
              <div className="flex items-center gap-2 text-accent font-bold uppercase tracking-widest text-xs">
                <Layers size={14} /> Executive Summary
              </div>
              <p className="text-2xl font-display font-light text-text-primary leading-snug">
                {displayData.executiveSummary}
              </p>
            </div>
          </div>
        </motion.div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard title="Rejection Rate" value={displayData.kpis?.rejectionRate?.value ?? 'N/A'} unit="%" trend={displayData.kpis?.rejectionRate?.trend} context={displayData.kpis?.rejectionRate?.context} />
          <KPICard title="Total Output" value={displayData.kpis?.totalOutput?.value ?? 'N/A'} unit="units" trend={displayData.kpis?.totalOutput?.trend} context={displayData.kpis?.totalOutput?.context} />
          <KPICard title="Downtime" value={displayData.kpis?.downtime?.value ?? 'N/A'} unit={displayData.kpis?.downtime?.unit || 'm'} trend={displayData.kpis?.downtime?.trend} context={displayData.kpis?.downtime?.context} />
          <KPICard title="Quality Score" value={displayData.kpis?.qualityScore?.value ?? 'N/A'} unit="%" trend={displayData.kpis?.qualityScore?.trend} context={displayData.kpis?.qualityScore?.context} />
        </div>

        {/* Chart Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {displayData.charts?.map((chart: any, i: number) => (
            <ChartContainer key={i} title={chart.title} type={chart.type} data={chart.data} />
          ))}
        </div>

        {/* Intelligence Insights & Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div 
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="lg:col-span-2 glass-card p-8 space-y-6"
          >
            <h3 className="text-lg font-display flex items-center gap-3">
              <Info className="text-accent" /> Key Intelligence Insights
            </h3>
            <div className="space-y-6">
              {(displayData.insights ?? []).map((insight: string, idx: number) => (
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
              {(displayData.recommendations ?? []).map((rec: string, i: number) => (
                <li key={i} className="flex gap-3 text-sm text-text-primary">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* Footer Data Tags */}
        <div className="flex flex-wrap gap-3 pt-12 border-t border-border opacity-40">
          {['Line4_Report.xlsx', 'Q1_Summary.csv', 'Daily_Ops_V2.xls'].map(tag => (
            <span key={tag} className="text-[10px] font-mono border border-white/20 px-2 py-1 rounded">
              {tag}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

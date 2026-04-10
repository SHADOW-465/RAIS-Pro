// src/components/InsightSlide.tsx
"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import html2canvas from "html2canvas";
import type { InsightSlide as InsightSlideType } from "@/types/dashboard";

interface InsightSlideProps {
  slide: InsightSlideType;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function InsightSlide({ slide }: InsightSlideProps) {
  const slideRef = useRef<HTMLDivElement>(null);

  const handleDownload = async () => {
    if (!slideRef.current) return;
    try {
      const canvas = await html2canvas(slideRef.current, {
        backgroundColor: "#f0f4ff",
        scale: 2,
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      const slug = slide.question
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      const date = new Date().toISOString().slice(0, 10);
      a.download = `rais-insight-${slug}-${date}.png`;
      a.click();
    } catch (err) {
      console.error("Export failed:", err);
    }
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#fff",
        borderColor: "rgba(0,0,0,0.08)",
        borderWidth: 1,
        titleColor: "#1e293b",
        bodyColor: "#475569",
        padding: 10,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#94a3b8", font: { size: 10 } },
        border: { color: "transparent" },
      },
      y: {
        grid: { color: "rgba(0,0,0,0.04)" },
        ticks: { color: "#94a3b8", font: { size: 10 } },
        border: { color: "transparent" },
      },
    },
  };

  // Inject default colours if datasets don't have them
  const colouredCharts = slide.charts.map((chart) => ({
    ...chart,
    data: {
      ...chart.data,
      datasets: chart.data.datasets.map((ds, i) => ({
        ...ds,
        backgroundColor: ds.backgroundColor ?? (
          chart.type === "doughnut"
            ? ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"]
            : `rgba(${i === 0 ? "99,102,241" : "14,165,233"},0.75)`
        ),
        borderColor: ds.borderColor ?? (i === 0 ? "#6366f1" : "#0ea5e9"),
        borderWidth: 2,
      })),
    },
  }));

  return (
    <motion.div
      ref={slideRef}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass-slide p-5 space-y-4"
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-sky-500">
            ◈ Insight Slide
          </span>
          <span className="text-[10px] text-text-muted">
            {formatTime(slide.createdAt)}
          </span>
        </div>
        <button
          onClick={handleDownload}
          className="text-[10px] text-text-muted hover:text-accent transition-colors"
          title="Download as PNG"
        >
          ⬇ Save
        </button>
      </div>

      {/* Question pill */}
      <div className="inline-block bg-sky-500/10 border border-sky-500/20 rounded-full px-3 py-1">
        <p className="text-[11px] text-sky-700 italic">"{slide.question}"</p>
      </div>

      {/* Headline */}
      <h3 className="text-base font-bold text-text-primary leading-snug">
        {slide.headline}
      </h3>

      {/* Charts */}
      {colouredCharts.length > 0 && (
        <div className={`grid gap-4 ${colouredCharts.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {colouredCharts.map((chart, i) => (
            <div key={i} className="bg-white/50 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-text-muted mb-2 uppercase tracking-wider">
                {chart.title}
              </p>
              <div className="h-36">
                {chart.type === "line" && (
                  <Line data={chart.data} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: colouredCharts.length === 1 } } } as any} />
                )}
                {chart.type === "bar" && (
                  <Bar data={chart.data} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: colouredCharts.length === 1 } } } as any} />
                )}
                {chart.type === "doughnut" && (
                  <Doughnut data={chart.data} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "right", labels: { color: "#475569", font: { size: 10 }, boxWidth: 10 } }, tooltip: chartOptions.plugins.tooltip } } as any} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bullets */}
      <ul className="space-y-2">
        {slide.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
            <span className="text-sky-500 font-bold mt-0.5 shrink-0">→</span>
            {bullet}
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

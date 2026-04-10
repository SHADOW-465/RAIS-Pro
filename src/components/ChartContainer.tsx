"use client";

import { motion } from "framer-motion";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
);

type ChartType = 'line' | 'bar' | 'horizontalBar' | 'area' | 'pie' | 'doughnut' | 'radar';

interface ChartContainerProps {
  title: string;
  description?: string;
  type: ChartType;
  data: any;
  options?: any;
}

export default function ChartContainer({ title, description, type, data, options }: ChartContainerProps) {
  // Normalise extended types to what chart.js supports
  const resolvedType: "line" | "bar" | "doughnut" =
    type === 'area' ? 'line' :
    type === 'horizontalBar' ? 'bar' :
    type === 'pie' ? 'doughnut' :
    type === 'radar' ? 'bar' :
    type;

  const textSecondary = "#475569";
  const textMuted     = "#94a3b8";
  const tooltipBg     = "#ffffff";
  const tooltipBorder = "rgba(0,0,0,0.08)";
  const gridColor     = "rgba(0,0,0,0.05)";

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          color: textSecondary,
          font: { family: "Inter", size: 10 },
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        borderWidth: 1,
        titleColor: "#0D1117",
        bodyColor: textSecondary,
        titleFont: { family: "Barlow Semi Condensed", size: 14 },
        bodyFont: { family: "Inter", size: 12 },
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
      },
    },
    scales:
      resolvedType !== "doughnut"
        ? {
            x: {
              grid: { display: false },
              ticks: { color: textMuted, font: { size: 10 } },
              border: { color: "transparent" },
            },
            y: {
              grid: { color: gridColor },
              ticks: { color: textMuted, font: { size: 10 } },
              border: { color: "transparent" },
            },
          }
        : {},
  };

  const chartOptions = { ...defaultOptions, ...options };

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
      className="glass-card p-5 h-[300px] flex flex-col"
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-4 pl-3 border-l-2 border-accent/30">
        {title}
      </p>
      {description && (
        <p className="text-[11px] text-text-muted mb-3 -mt-2">{description}</p>
      )}
      <div className="flex-1 w-full relative">
        {resolvedType === "line"     && <Line     data={data} options={chartOptions} />}
        {resolvedType === "bar"      && <Bar      data={data} options={chartOptions} />}
        {resolvedType === "doughnut" && <Doughnut data={data} options={chartOptions} />}
      </div>
    </motion.div>
  );
}

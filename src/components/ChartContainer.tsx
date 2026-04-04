"use client";

import { useMemo } from "react";
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
import { useTheme } from "@/context/ThemeContext";
import type { ChartConfig } from "@/lib/types";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend, Filler, ArcElement
);

const DARK_COLORS = {
  text: "#8892A4",
  muted: "#4A5468",
  surface: "#161A28",
  grid: "rgba(74, 84, 104, 0.15)",
};

const LIGHT_COLORS = {
  text: "#475569",
  muted: "#94A3B8",
  surface: "#F8FAFC",
  grid: "rgba(148, 163, 184, 0.25)",
};

interface ChartContainerProps extends ChartConfig {
  options?: object;
}

export default function ChartContainer({ title, type, data, options }: ChartContainerProps) {
  const { theme } = useTheme();
  const c = theme === "dark" ? DARK_COLORS : LIGHT_COLORS;

  const defaultOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          color: c.text,
          font: { family: "Inter", size: 10 },
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: c.surface,
        titleColor: c.text,
        bodyColor: c.muted,
        titleFont: { family: "Barlow Semi Condensed", size: 14 },
        bodyFont: { family: "Inter", size: 12 },
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        borderColor: c.grid,
        borderWidth: 1,
      },
    },
    scales:
      type !== "doughnut"
        ? {
            x: {
              grid: { display: false },
              ticks: { color: c.muted, font: { size: 10 } },
            },
            y: {
              grid: { color: c.grid },
              ticks: { color: c.muted, font: { size: 10 } },
            },
          }
        : {},
  }), [theme, type, c]);

  const chartOptions = useMemo(
    () => ({ ...defaultOptions, ...options }),
    [defaultOptions, options]
  );

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
      className="glass-card p-6 h-[350px] flex flex-col"
    >
      <h3 className="text-text-secondary font-condensed font-bold uppercase tracking-widest text-xs mb-6 border-l-2 border-accent/40 pl-3">
        {title}
      </h3>
      <div className="flex-1 w-full relative">
        {type === "line" && <Line data={data} options={chartOptions} />}
        {type === "bar" && <Bar data={data} options={chartOptions} />}
        {type === "doughnut" && <Doughnut data={data} options={chartOptions} />}
      </div>
    </motion.div>
  );
}

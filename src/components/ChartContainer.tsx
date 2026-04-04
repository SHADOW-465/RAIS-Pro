"use client";

import { useEffect, useState } from "react";
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

interface ChartContainerProps {
  title: string;
  type: "line" | "bar" | "doughnut";
  data: any;
  options?: any;
}

function useIsDark() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export default function ChartContainer({ title, type, data, options }: ChartContainerProps) {
  const isDark = useIsDark();

  const textSecondary = isDark ? "#8892A4" : "#4A5568";
  const textMuted     = isDark ? "#4A5468" : "#8B95A7";
  const tooltipBg     = isDark ? "#161A28" : "#FFFFFF";
  const tooltipBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const gridColor     = isDark ? "rgba(74,84,104,0.1)" : "rgba(0,0,0,0.06)";

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
        titleColor: isDark ? "#EEF1F8" : "#0D1117",
        bodyColor: textSecondary,
        titleFont: { family: "Barlow Semi Condensed", size: 14 },
        bodyFont: { family: "Inter", size: 12 },
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
      },
    },
    scales:
      type !== "doughnut"
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
      className="glass-card p-6 h-[350px] flex flex-col"
    >
      <h3 className="text-text-secondary font-condensed font-bold uppercase tracking-widest text-xs mb-6 px-1 border-l-2 border-accent/40 pl-3">
        {title}
      </h3>
      <div className="flex-1 w-full relative">
        {type === "line"     && <Line     data={data} options={chartOptions} />}
        {type === "bar"      && <Bar      data={data} options={chartOptions} />}
        {type === "doughnut" && <Doughnut data={data} options={chartOptions} />}
      </div>
    </motion.div>
  );
}

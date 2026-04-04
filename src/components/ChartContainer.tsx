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
  ArcElement
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

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

export default function ChartContainer({ title, type, data, options }: ChartContainerProps) {
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#8892A4',
          font: { family: 'Inter', size: 10 },
          usePointStyle: true,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: '#161A28',
        titleFont: { family: 'Barlow Semi Condensed', size: 14 },
        bodyFont: { family: 'Inter', size: 12 },
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
      },
    },
    scales: type !== 'doughnut' ? {
      x: {
        grid: { display: false },
        ticks: { color: '#4A5468', font: { size: 10 } },
      },
      y: {
        grid: { color: 'rgba(74, 84, 104, 0.1)' },
        ticks: { color: '#4A5468', font: { size: 10 } },
      },
    } : {},
  };

  const chartOptions = { ...defaultOptions, ...options };

  const variants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 }
  };

  return (
    <motion.div
      variants={variants}
      className="glass-card p-6 h-[350px] flex flex-col"
    >
      <h3 className="text-text-secondary font-condensed font-bold uppercase tracking-widest text-xs mb-6 px-1 border-l-2 border-accent/40 pl-3">
        {title}
      </h3>
      <div className="flex-1 w-full relative">
        {type === 'line' && <Line data={data} options={chartOptions} />}
        {type === 'bar' && <Bar data={data} options={chartOptions} />}
        {type === 'doughnut' && <Doughnut data={data} options={chartOptions} />}
      </div>
    </motion.div>
  );
}

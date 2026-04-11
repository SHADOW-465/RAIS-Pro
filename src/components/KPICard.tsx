// src/components/KPICard.tsx
"use client";

import { forwardRef } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KPI } from "@/types/dashboard";

interface KPICardProps {
  kpi: KPI;
  isActive?: boolean;
  onClick?: () => void;
}

const KPICard = forwardRef<HTMLDivElement, KPICardProps>(
  function KPICard({ kpi, isActive, onClick }, ref) {
    const { label, value, unit, trend, context } = kpi;

    return (
      <motion.div
        ref={ref}
        variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
        onClick={onClick}
        className={`glass-card p-5 flex flex-col justify-between h-full transition-all duration-200 ${
          onClick ? "cursor-pointer" : ""
        } ${
          isActive
            ? "ring-2 ring-accent/60 shadow-[0_0_20px_rgba(99,102,241,0.25)]"
            : onClick
            ? "hover:ring-1 hover:ring-accent/30"
            : ""
        }`}
      >
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            {label}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-text-primary tracking-tight">
              {value}
            </span>
            {unit && (
              <span className="text-sm text-text-muted font-medium">{unit}</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/60 pt-3">
          <div className={`flex items-center gap-1 text-xs font-bold ${
            trend === 1 ? "text-success" : trend === -1 ? "text-danger" : "text-text-muted"
          }`}>
            {trend === 1 ? <TrendingUp size={14} /> : trend === -1 ? <TrendingDown size={14} /> : <Minus size={14} />}
            <span>{trend === 1 ? "Improving" : trend === -1 ? "Declining" : "Stable"}</span>
          </div>
          <span className="text-[10px] text-text-muted">{context || "—"}</span>
        </div>
      </motion.div>
    );
  }
);

export default KPICard;

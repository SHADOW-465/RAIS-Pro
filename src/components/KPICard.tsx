// src/components/KPICard.tsx
"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KPI } from "@/types/dashboard";

interface KPICardProps {
  kpi: KPI;
}

export default function KPICard({ kpi }: KPICardProps) {
  const { label, value, unit, trend, context } = kpi;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      }}
      className="glass-card p-6 flex flex-col justify-between group h-full"
    >
      <div className="space-y-2">
        <h3 className="text-text-secondary font-condensed font-bold uppercase tracking-widest text-xs">
          {label}
        </h3>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-display font-bold text-text-primary tracking-tight">
            {value}
          </span>
          {unit && (
            <span className="text-text-muted font-condensed text-sm">{unit}</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
        <div className={`flex items-center gap-1 text-sm font-bold font-condensed ${
          trend === 1 ? 'text-success' : trend === -1 ? 'text-danger' : 'text-text-muted'
        }`}>
          {trend === 1
            ? <TrendingUp size={16} />
            : trend === -1
            ? <TrendingDown size={16} />
            : <Minus size={16} />}
        </div>
        <span className="text-[10px] text-text-muted font-mono uppercase tracking-tighter">
          {context || "—"}
        </span>
      </div>
    </motion.div>
  );
}

"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { KPIMetric } from "@/lib/types";

interface KPICardProps extends KPIMetric {
  title: string;
}

export default function KPICard({ title, value, trend, unit, context }: KPICardProps) {
  const isPositive = trend !== undefined && trend > 0;
  const isNegative = trend !== undefined && trend < 0;

  const trendColor = isPositive
    ? "text-success"
    : isNegative
    ? "text-danger"
    : "text-text-muted";

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
      className="glass-card p-6 flex flex-col justify-between group h-full"
    >
      <div className="space-y-2">
        <h3 className="text-text-secondary font-condensed font-bold uppercase tracking-widest text-xs">
          {title}
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

      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-bold font-condensed ${trendColor}`}>
            {isPositive ? (
              <TrendingUp size={16} />
            ) : isNegative ? (
              <TrendingDown size={16} />
            ) : (
              <Minus size={16} />
            )}
            {Math.abs(trend)}%
          </div>
        )}
        <span className="text-[10px] text-text-muted font-mono uppercase tracking-tighter">
          {context ?? "Real-time"}
        </span>
      </div>
    </motion.div>
  );
}

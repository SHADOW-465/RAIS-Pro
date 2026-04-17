// src/components/SourcesPanel.tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, CheckCircle2, XCircle, AlertTriangle, Database } from "lucide-react";
import type { MergePlan } from "@/types/analysis";

interface SourcesPanelProps {
  mergePlan: MergePlan;
}

export default function SourcesPanel({ mergePlan }: SourcesPanelProps) {
  const [open, setOpen] = useState(false);

  const hasExclusions = mergePlan.excludedSheets.length > 0;
  const hasWarnings   = mergePlan.warnings.length > 0;
  const multiGroup    = mergePlan.groups.length > 1;

  const totalIncluded = mergePlan.groups.reduce((n, g) => n + g.sheets.length, 0);

  return (
    <div className="glass-card overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-3.5 flex items-center gap-3 text-left hover:bg-white/20 transition-colors"
      >
        <Database size={13} className="text-accent shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-text-muted flex-1">
          Data Sources
        </span>

        {/* Quick badges */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-success/10 text-success border border-success/20 px-2 py-0.5 rounded-full font-semibold">
            {totalIncluded} sheet{totalIncluded !== 1 ? 's' : ''} used
          </span>
          {hasExclusions && (
            <span className="text-[10px] bg-warning/10 text-warning border border-warning/20 px-2 py-0.5 rounded-full font-semibold">
              {mergePlan.excludedSheets.length} excluded
            </span>
          )}
          {hasWarnings && (
            <span className="text-[10px] bg-danger/10 text-danger border border-danger/20 px-2 py-0.5 rounded-full font-semibold">
              {mergePlan.warnings.length} warning{mergePlan.warnings.length !== 1 ? 's' : ''}
            </span>
          )}
          <ChevronDown
            size={13}
            className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-white/30">

              {/* Source groups */}
              <div className="space-y-3">
                {mergePlan.groups.map((group, i) => (
                  <div key={i} className="space-y-1.5">
                    {multiGroup && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-accent">
                        {group.label}
                      </p>
                    )}
                    {group.sheets.map((sheet, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <CheckCircle2 size={12} className="text-success mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-text-primary font-medium">{sheet}</p>
                          {j === 0 && (
                            <p className="text-[10px] text-text-muted">{group.reason}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Exclusions */}
              {hasExclusions && (
                <div className="space-y-2 pt-2 border-t border-white/20">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-warning flex items-center gap-1.5">
                    <XCircle size={10} /> Excluded (would double-count)
                  </p>
                  {mergePlan.excludedSheets.map((e, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <XCircle size={12} className="text-warning/60 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-text-secondary">{e.sheet}</p>
                        <p className="text-[10px] text-text-muted">{e.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {hasWarnings && (
                <div className="space-y-2 pt-2 border-t border-white/20">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-danger flex items-center gap-1.5">
                    <AlertTriangle size={10} /> Warnings
                  </p>
                  {mergePlan.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle size={12} className="text-danger/60 mt-0.5 shrink-0" />
                      <p className="text-xs text-text-secondary">{w}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Strategy badge */}
              <div className="pt-2 border-t border-white/20 flex items-center gap-2">
                <span className="text-[10px] text-text-muted">Cross-file strategy:</span>
                <span className="text-[10px] font-bold text-text-primary capitalize">
                  {mergePlan.crossFileStrategy === 'sum' ? 'Sum all sources' : 'Show sources separately'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

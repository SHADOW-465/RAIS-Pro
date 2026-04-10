"use client";

import { motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface StatusAlertProps {
  message: string;
  type?: "danger" | "warning" | "info";
  onClose?: () => void;
}

export default function StatusAlert({ message, type = "danger", onClose }: StatusAlertProps) {
  const alertStyles = {
    danger: { bg: "bg-danger/8", border: "border-danger/25", icon: "text-danger" },
    warning: { bg: "bg-warning/8", border: "border-warning/25", icon: "text-warning" },
    info: { bg: "bg-accent/8", border: "border-accent/25", icon: "text-accent" },
  };

  const style = alertStyles[type] ?? alertStyles.danger;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={`w-full rounded-xl px-5 py-4 flex items-start gap-3 border backdrop-blur-md ${style.bg} ${style.border} mb-8 overflow-hidden`}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle size={20} className={`shrink-0 ${style.icon}`} />
        <span className="font-condensed font-bold uppercase tracking-wider text-sm">
          {message}
        </span>
      </div>
      {onClose && (
        <button onClick={onClose} className="hover:opacity-50 transition-opacity">
          <X size={18} />
        </button>
      )}
    </motion.div>
  );
}

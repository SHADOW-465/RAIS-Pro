"use client";

import { motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface StatusAlertProps {
  message: string;
  type?: "danger" | "warning" | "info";
  onClose?: () => void;
}

export default function StatusAlert({ message, type = "danger", onClose }: StatusAlertProps) {
  const styles = {
    danger: "bg-danger/10 border-danger/20 text-danger",
    warning: "bg-warning/10 border-warning/20 text-warning",
    info: "bg-accent/10 border-accent/20 text-accent",
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className={`w-full glass border p-4 flex items-center justify-between gap-4 mb-8 overflow-hidden ${styles[type]}`}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle size={20} className="shrink-0" />
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

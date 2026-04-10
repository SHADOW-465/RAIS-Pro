"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

// CSS animation for spinner
const spinnerStyles = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const steps = [
  "Reading Excel files",
  "Extracting data structures",
  "Building analysis context",
  "Running AI analysis",
  "Rendering dashboard"
];

export default function ProcessingLoader() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = spinnerStyles;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return (
    <div className="glass-card px-12 py-10 w-full max-w-sm text-center space-y-8">
      {/* Animated Spinner Core */}
      <svg width="80" height="80" viewBox="0 0 80 80" className="mx-auto">
        {/* outer track ring */}
        <circle cx="40" cy="40" r="34" stroke="rgba(99,102,241,0.15)" strokeWidth="4" fill="none" />
        {/* animated arc */}
        <circle cx="40" cy="40" r="34" stroke="url(#spinGrad)" strokeWidth="4" fill="none"
          strokeDasharray="60 154" strokeLinecap="round"
          style={{ transformOrigin: "center", animation: "spin 1.4s linear infinite" }} />
        {/* gradient definition */}
        <defs>
          <linearGradient id="spinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
      </svg>

      <h2 className="text-4xl font-display font-medium text-text-primary tracking-tight">
        Analyzing your data
      </h2>

      <div className="space-y-4">
        {steps.map((step, idx) => (
          <motion.div
            key={step}
            initial={{ opacity: 0.3, x: -10 }}
            animate={{
              opacity: idx <= currentStep ? 1 : 0.3,
              x: idx === currentStep ? 0 : -10
            }}
            className="flex items-center justify-between p-3"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                {idx < currentStep ? (
                  <CheckCircle2
                    className="text-success"
                    size={20}
                  />
                ) : idx === currentStep ? (
                  <Loader2
                    className="animate-spin text-accent"
                    size={20}
                  />
                ) : (
                  <CircleDashed
                    className="text-text-muted"
                    size={20}
                  />
                )}
                {idx === currentStep && (
                  <motion.div
                    layoutId="pulsing-ring"
                    className="absolute -inset-1 rounded-full border border-accent/30"
                    animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </div>
              <span className={`font-condensed font-bold uppercase tracking-wider text-sm transition-colors duration-500 ${
                idx === currentStep ? 'text-text-primary' : idx < currentStep ? 'text-text-primary' : 'text-text-muted'
              }`}>
                {step}
              </span>
            </div>

            <AnimatePresence>
              {idx < currentStep && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded font-mono"
                >
                  COMPLETE
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      <p className="text-text-muted font-condensed text-xs uppercase tracking-[0.3em] font-bold animate-pulse">
        Secure AI Engine Active
      </p>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

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

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-12">
      {/* Animated Spinner Core */}
      <div className="relative w-32 h-32">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-t-2 border-accent shadow-[0_0_15px_rgba(0,229,204,0.3)]"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute inset-4 rounded-full border-b-2 border-accent/40"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-3 h-3 bg-accent rounded-full shadow-[0_0_20px_#00E5CC]"
          />
        </div>
      </div>

      <div className="text-center space-y-8 max-w-md w-full">
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
                x: idx === currentStep ? 0 : -10,
                color: idx === currentStep ? "var(--color-accent)" : "var(--color-text-secondary)"
              }}
              className="group flex items-center justify-between p-4 glass-card border-none bg-surface/20"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  {idx < currentStep ? (
                    <CheckCircle2 className="text-accent" size={20} />
                  ) : idx === currentStep ? (
                    <Loader2 className="animate-spin text-accent" size={20} />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-text-muted/30" />
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
                <span className="font-condensed font-bold uppercase tracking-wider text-sm transition-colors duration-500">
                  {step}
                </span>
              </div>
              
              <AnimatePresence>
                {idx < currentStep && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded font-mono"
                  >
                    COMPLETE
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>

      <p className="text-text-muted font-condensed text-xs uppercase tracking-[0.3em] font-bold animate-pulse">
        Secure AI Engine Active
      </p>
    </div>
  );
}

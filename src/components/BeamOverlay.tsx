// src/components/BeamOverlay.tsx
"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface BeamEndpoints {
  from: DOMRect;
  to: DOMRect;
  id: string;
}

interface BeamOverlayProps {
  beams: BeamEndpoints[];
}

function CubicBeam({ from, to, id }: BeamEndpoints) {
  const pathRef = useRef<SVGPathElement>(null);

  const fromX = from.right;
  const fromY = from.top + from.height / 2;
  const toX = to.left;
  const toY = to.top + to.height / 2;

  const dist = Math.abs(toX - fromX);
  const cp1x = fromX + dist * 0.5;
  const cp1y = fromY;
  const cp2x = toX - dist * 0.5;
  const cp2y = toY;

  const d = `M ${fromX} ${fromY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${toX} ${toY}`;

  return (
    <g key={id}>
      {/* Glow track */}
      <path
        d={d}
        fill="none"
        stroke="url(#beamGradient)"
        strokeWidth={2}
        strokeOpacity={0.18}
        filter="url(#beamBlur)"
      />
      {/* Animated beam */}
      <motion.path
        ref={pathRef}
        d={d}
        fill="none"
        stroke="url(#beamGradient)"
        strokeWidth={1.5}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        exit={{ pathLength: 0, opacity: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      />
      {/* Dot at source */}
      <motion.circle
        cx={fromX}
        cy={fromY}
        r={4}
        fill="#6366f1"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ delay: 0.1 }}
      />
      {/* Dot at destination */}
      <motion.circle
        cx={toX}
        cy={toY}
        r={4}
        fill="#0ea5e9"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ delay: 0.45 }}
      />
    </g>
  );
}

export default function BeamOverlay({ beams }: BeamOverlayProps) {
  if (beams.length === 0) return null;

  return (
    <svg
      className="fixed inset-0 w-screen h-screen pointer-events-none"
      style={{ zIndex: 9999 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="beamGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <filter id="beamBlur" x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      <AnimatePresence>
        {beams.map(b => (
          <CubicBeam key={b.id} from={b.from} to={b.to} id={b.id} />
        ))}
      </AnimatePresence>
    </svg>
  );
}

// src/components/BeamOverlay.tsx
"use client";

export interface BeamEndpoints {
  from: DOMRect;
  to: DOMRect;
  id: string;
}

interface BeamOverlayProps {
  beams: BeamEndpoints[];
}

function Beam({ from, to, id }: BeamEndpoints) {
  const fromX = from.right;
  const fromY = from.top + from.height / 2;
  const toX = to.left;
  const toY = to.top + to.height / 2;
  const dx = toX - fromX;
  const c1x = fromX + Math.max(80, dx * 0.45);
  const c1y = fromY;
  const c2x = toX - Math.max(80, dx * 0.45);
  const c2y = toY;
  const d = `M ${fromX} ${fromY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${toX - 4} ${toY}`;
  const length = Math.hypot(dx, toY - fromY) + 200;

  return (
    <g key={id}>
      {/* glow */}
      <path
        d={d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        opacity="0.18"
        filter="url(#beam-glow)"
      />
      {/* main */}
      <path
        d={d}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.75"
        strokeLinecap="round"
        markerEnd="url(#beam-arrow)"
        style={{
          strokeDasharray: length,
          strokeDashoffset: 0,
          animation: "draw-line 0.6s cubic-bezier(.2,.7,.2,1) both",
          ["--len" as any]: length,
        }}
      />
      {/* flowing dots overlay */}
      <path
        d={d}
        fill="none"
        stroke="var(--accent-hover)"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="beam-flow"
        opacity="0.8"
      />
      {/* origin halo */}
      <circle cx={fromX} cy={fromY} r="4" fill="var(--accent)" />
      <circle cx={fromX} cy={fromY} r="8" fill="var(--accent)" opacity="0.2" />
    </g>
  );
}

export default function BeamOverlay({ beams }: BeamOverlayProps) {
  if (beams.length === 0) return null;
  return (
    <svg
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 100,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="beam-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
        </marker>
        <filter id="beam-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {beams.map((b) => (
        <Beam key={b.id} {...b} />
      ))}
    </svg>
  );
}

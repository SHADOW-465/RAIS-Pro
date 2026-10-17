// Splits a time series into drawable runs of real data, plus short dashed
// bridges across no-production gaps. Empty periods never get a point.

/** Longest run of consecutive empty periods that is bridged by a dashed connector. */
export const MAX_BRIDGE_GAP = 3;

export type ChartSegments = {
  /** Consecutive indices that have real data. Each run is drawn solid, with fill. */
  runs: number[][];
  /** [lastIndexBefore, firstIndexAfter] for gaps of 1..maxGap empty periods. Drawn dashed, no fill, no dot. */
  bridges: [number, number][];
};

export function splitSegments(
  live: boolean[],
  from = 0,
  to = live.length - 1,
  maxGap = MAX_BRIDGE_GAP,
): ChartSegments {
  const runs: number[][] = [];
  let cur: number[] = [];
  for (let i = Math.max(0, from); i <= Math.min(to, live.length - 1); i++) {
    if (live[i]) cur.push(i);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  const bridges: [number, number][] = [];
  for (let k = 1; k < runs.length; k++) {
    const a = runs[k - 1][runs[k - 1].length - 1];
    const b = runs[k][0];
    if (b - a - 1 <= maxGap) bridges.push([a, b]);
  }
  return { runs, bridges };
}

/** The bridge whose empty span contains index i, if any. */
export function bridgeAt(bridges: [number, number][], i: number): [number, number] | null {
  return bridges.find(([a, b]) => i > a && i < b) ?? null;
}

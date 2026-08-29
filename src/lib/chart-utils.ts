import { useState, useEffect, useRef } from "react";

/**
 * Calculates the baseline spacing in pixels between points based on the total number of points,
 * preventing overlap.
 */
export function getBaseSpacing(n: number): number {
  if (n <= 30) return 50;
  if (n <= 90) return 35;
  if (n <= 180) return 28;
  if (n <= 365) return 22;
  return 20;
}

/**
 * Hook to dynamically track the client container's width using a ResizeObserver,
 * defaulting to a safe fallback width during SSR or before mounting.
 */
export function useContainerWidth(fallbackWidth = 660) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallbackWidth);

  useEffect(() => {
    if (!ref.current) return;
    
    // Set initial width
    setWidth(ref.current.getBoundingClientRect().width || fallbackWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [fallbackWidth]);

  return { ref, width };
}

/**
 * Calculates the closest index in a chart based on the clientX of a mouse event,
 * the container's left bounding rect value, and the point spacing.
 */
export function hoverIndexFromPixels(
  clientX: number,
  rectLeft: number,
  padX: number,
  spacing: number,
  n: number
): number {
  const relX = clientX - rectLeft;
  const idx = Math.round((relX - padX) / Math.max(spacing, 0.0001));
  return Math.max(0, Math.min(n - 1, idx));
}

/**
 * Rounds up to a "nice" 1/2/5 × 10^n number so axis gridlines land on
 * human-friendly increments regardless of the data's magnitude — tiny
 * percentages, rupee lakhs, and raw counts all get a sensibly-stepped axis.
 */
export function niceAxisMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exponent);
  const fraction = value / magnitude;
  let niceFraction: number;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * magnitude;
}

/**
 * Determines if a label at a given index should be displayed on the X-axis,
 * implementing adaptive date thinning based on spacing and active grain.
 */
export function shouldShowLabel(
  label: string,
  index: number,
  labels: string[],
  spacing: number,
  grain: string
): boolean {
  if (grain === "day") {
    // For daily view, always show all daily dates since they are rotated vertically and scrollable
    return true;
  }

  const step = Math.max(1, Math.ceil(55 / spacing));
  return index % step === 0;
}

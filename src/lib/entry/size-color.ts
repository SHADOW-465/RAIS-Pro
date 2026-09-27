// Balloon-capacity size color code, from the plant's own DS/ANX/05
// (Dispofoley Latex Foley Balloon Capacity) chart — the "COLOR CODE" legend
// row keyed to FR size. One color per even FR size 6Fr and up; the eleven
// colors repeat every 22Fr (28Fr reuses 6Fr's Brown, 30Fr reuses 8Fr's Black),
// exactly as the chart itself repeats past 26Fr.
export type SizeColor = { name: string; hex: string; textOn: "light" | "dark" };

const COLOR_CYCLE: readonly SizeColor[] = [
  { name: "Brown", hex: "#CC3300", textOn: "light" },
  { name: "Black", hex: "#000000", textOn: "light" },
  { name: "Ash Grey", hex: "#7E7E7E", textOn: "light" },
  { name: "White", hex: "#FFFFFF", textOn: "dark" },
  { name: "Green", hex: "#269A26", textOn: "light" },
  { name: "Orange", hex: "#F4B084", textOn: "dark" },
  { name: "Red", hex: "#FF0000", textOn: "light" },
  { name: "Yellow", hex: "#FFFF00", textOn: "dark" },
  { name: "Violet", hex: "#7030A0", textOn: "light" },
  { name: "Dark Blue", hex: "#002060", textOn: "light" },
  { name: "Pink", hex: "#EA769F", textOn: "dark" },
];

/**
 * FR size ("14", "14Fr", "Fr14", 14, …) → its DS/ANX/05 color-code swatch.
 * Null for anything that isn't a plain even FR size 6 and up (the chart's
 * range), so an unparseable or out-of-range size just renders with no color.
 */
export function sizeColorFor(size: string | number | null | undefined): SizeColor | null {
  if (size == null) return null;
  const digits = String(size).match(/\d+/)?.[0];
  if (!digits) return null;
  const fr = Number(digits);
  if (!Number.isFinite(fr) || fr < 6 || fr % 2 !== 0) return null;
  return COLOR_CYCLE[((fr - 6) / 2) % COLOR_CYCLE.length];
}

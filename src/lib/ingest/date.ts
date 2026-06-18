const MONTHS: Record<string, number> = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
};
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO yyyy-mm-dd using LOCAL calendar fields (avoids the UTC -1 day shift). */
export function toLocalISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Excel date parsing can result in times slightly before midnight (e.g., 23:59:50).
    // Adding 12 hours shifts it to the correct calendar day.
    const adjusted = new Date(v.getTime() + 12 * 60 * 60 * 1000);
    return `${adjusted.getFullYear()}-${pad(adjusted.getMonth() + 1)}-${pad(adjusted.getDate())}`;
  }
  if (typeof v === "number") {
    if (v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
    return null;
  }
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime()) && /\d{4}|\d{1,2}[/-]\d{1,2}/.test(s)) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

/** Derive an ISO date from a filename. Handles 'D MONTH YY' and 'MONTH YYYY'.
 *  Two-digit years map to 2000+YY. Returns null if no month found. */
export function dateFromFilename(name: string): string | null {
  const base = name.replace(/\.[a-z]+$/i, "");
  const monthMatch = base.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
  if (!monthMatch) return null;
  const month = MONTHS[monthMatch[1].toLowerCase()];
  const yearMatch = base.match(/\b(20\d{2})\b(?=[^0-9]*$)/) || base.match(/\b(\d{2})\b(?=[^0-9]*$)/);
  if (!yearMatch) return null;
  const y = Number(yearMatch[1]);
  const year = y < 100 ? 2000 + y : y;
  const dayMatch = base.match(/^(\d{1,2})\s+[A-Za-z]/);
  const day = dayMatch ? Number(dayMatch[1]) : 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

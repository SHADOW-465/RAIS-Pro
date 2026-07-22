// Parse a natural period phrase into {from,to,grain}. Pure. Anchored on the
// data's latest date so "last 90 days" lands on real data (never a wall clock).
import type { Grain } from "./scope";

export interface DatePhrase {
  from: string;
  to: string;
  grain: Grain;
  matchedText: string;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

export function parseDatePhrase(text: string, dataMaxIso: string): DatePhrase | null {
  const t = text.toLowerCase();
  const [my, mm] = dataMaxIso.split("-").map(Number);

  // "this fy" / "this financial year" / "this fiscal year" / "this year"
  if (/\bthis (fy|financial year|fiscal year|year)\b/.test(t)) {
    const startYear = mm >= 4 ? my : my - 1;
    return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31`, grain: "fy", matchedText: "this fy" };
  }

  // "last N days"
  const days = t.match(/\blast (\d{1,3}) days?\b/);
  if (days) {
    const n = Number(days[1]);
    const end = new Date(`${dataMaxIso}T00:00:00Z`);
    const start = new Date(end.getTime() - n * 86_400_000);
    return {
      from: start.toISOString().slice(0, 10),
      to: dataMaxIso,
      grain: "day",
      matchedText: days[0],
    };
  }

  // "last month" / "this month"
  if (/\blast month\b/.test(t)) {
    const y = mm === 1 ? my - 1 : my;
    const m = mm === 1 ? 12 : mm - 1;
    return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)), grain: "month", matchedText: "last month" };
  }
  if (/\bthis month\b/.test(t)) {
    return { from: iso(my, mm, 1), to: iso(my, mm, lastDay(my, mm)), grain: "month", matchedText: "this month" };
  }

  // "last quarter" — the previous complete calendar quarter relative to dataMax
  if (/\blast quarter\b/.test(t)) {
    const currentQ = Math.ceil(mm / 3);
    let prevQ = currentQ - 1;
    let year = my;
    if (prevQ === 0) { prevQ = 4; year = my - 1; }
    const startM = (prevQ - 1) * 3 + 1;
    const endM = prevQ * 3;
    return { from: iso(year, startM, 1), to: iso(year, endM, lastDay(year, endM)), grain: "month", matchedText: "last quarter" };
  }

  // Bare month name → most recent occurrence at/before dataMax
  for (let i = 0; i < MONTHS.length; i++) {
    const re = new RegExp(`\\b${MONTHS[i]}\\b`);
    if (re.test(t)) {
      const monthNo = i + 1;
      const year = monthNo <= mm ? my : my - 1;
      return {
        from: iso(year, monthNo, 1),
        to: iso(year, monthNo, lastDay(year, monthNo)),
        grain: "month",
        matchedText: MONTHS[i],
      };
    }
  }

  return null;
}

// Bi-directional Batch ID binding for shop-floor entry.
// Nomenclature: YY + Month Code (A–L) + DD + "-" + Size (FR digits)
// Example: June 27, 2026 + 14Fr → 26F27-14

const MONTH_CODES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Accepts "14Fr", "14FR", "Fr14", "14" → FR number string e.g. "14". */
export function frDigitsFromSize(size: string): string | null {
  const s = size.trim();
  const m =
    s.match(/^(\d{1,2})\s*[Ff][Rr]$/) ||
    s.match(/^[Ff][Rr]\s*(\d{1,2})$/) ||
    s.match(/^(\d{1,2})$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 6 || n > 30) return null;
  return String(n);
}

/** Canonical size id used in the event ledger: "Fr14". */
export function toCanonicalSize(size: string): string | null {
  const d = frDigitsFromSize(size);
  return d ? `Fr${d}` : null;
}

/** UI label: "14Fr". */
export function toDisplaySize(size: string): string | null {
  const d = frDigitsFromSize(size);
  return d ? `${d}Fr` : null;
}

export type BatchParts = {
  year2: string;       // "26"
  monthCode: string;   // "F"
  monthName: string;   // "June"
  monthIndex: number;  // 0–11
  day: string;         // "27"
  sizeFr: string;      // "14"
  date: string;        // "2026-06-27"
  batchId: string;     // "26F27-14"
};

/** Form → Batch ID. Date is YYYY-MM-DD; size is any accepted FR form. */
export function buildBatchId(date: string, size: string): string | null {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dm) return null;
  const year = Number(dm[1]);
  const month = Number(dm[2]);
  const day = Number(dm[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const fr = frDigitsFromSize(size);
  if (!fr) return null;
  const yy = String(year % 100).padStart(2, "0");
  const code = MONTH_CODES[month - 1];
  const dd = String(day).padStart(2, "0");
  return `${yy}${code}${dd}-${fr}`;
}

/**
 * Normalize typed batch input: uppercase, insert the hyphen after YY+Month+DD.
 * Examples: `26F2714` → `26F27-14`, `26f27-14` → `26F27-14`.
 */
export function formatBatchIdInput(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^0-9A-L-]/g, "");
  // Keep only the first hyphen positionally by rebuilding: prefix then size digits.
  const noDash = cleaned.replace(/-/g, "");
  if (noDash.length === 0) return "";
  // YY (2) + month letter (1) + DD (2) = 5; remainder is FR size (≤2 digits).
  if (noDash.length <= 5) return noDash;
  const prefix = noDash.slice(0, 5);
  const size = noDash.slice(5).replace(/[^0-9]/g, "").slice(0, 2);
  return size ? `${prefix}-${size}` : prefix;
}

/**
 * The one spelling of a lot code.
 *
 * The ledger held `26G0816` AND `26G08-16`, and `26G01-6` AND `26G01-06` — the
 * same two physical lots, split in two. The consequences were silent: a lot
 * showed "3/4 Stalled" because its Final gate sat under the twin, and a gate's
 * checked quantity was short by whatever the twin held, so its rejection rate
 * was wrong.
 *
 * Canonical form matches what `buildBatchId` produces, because that is what the
 * form writes on the happy path: YY + month letter + 2-digit day + "-" + FR
 * size with no leading zero. `26G0816` and `26G01-06` both fold onto it.
 *
 * Returns the input trimmed+uppercased when it cannot be parsed — never null,
 * so a hand-typed oddity still groups with itself instead of vanishing.
 */
export function canonicalBatchId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return null;

  // YY + month letter + day(1-2) + optional separator + size(1-2).
  const m = s.match(/^(\d{2})([A-L])(\d{1,2})[-_/ ]?(\d{1,2})?$/);
  if (!m) return s;

  const [, yy, code, day, size] = m;
  const dd = day.padStart(2, "0");
  if (!size) return `${yy}${code}${dd}`;
  // "06" and "6" are the same French size; buildBatchId never pads it.
  const fr = String(Number(size));
  return `${yy}${code}${dd}-${fr}`;
}

/** True when the code is already the one spelling the ledger will store. */
export function isCanonicalBatchId(raw: string): boolean {
  const c = canonicalBatchId(raw);
  return !!c && c === raw.trim().toUpperCase();
}

/**
 * Batch ID → form fields.
 * Accepts with or without size suffix: `26F27-14` or `26F27` (size optional).
 */
export function parseBatchId(raw: string): BatchParts | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  // YY + A-L + DD + optional -SIZE
  const m = s.match(/^(\d{2})([A-L])(\d{2})(?:-(\d{1,2}))?$/);
  if (!m) return null;
  const year2 = m[1];
  const monthCode = m[2];
  const day = m[3];
  const sizeFr = m[4] ?? null;
  const monthIndex = MONTH_CODES.indexOf(monthCode as (typeof MONTH_CODES)[number]);
  if (monthIndex < 0) return null;
  const dayNum = Number(day);
  if (dayNum < 1 || dayNum > 31) return null;
  // Century: 00–79 → 2000+, 80–99 → 1900+ (shop floor is current century)
  const yearFull = Number(year2) >= 80 ? 1900 + Number(year2) : 2000 + Number(year2);
  const mm = String(monthIndex + 1).padStart(2, "0");
  const date = `${yearFull}-${mm}-${day}`;
  // Validate calendar date
  const check = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.getUTCDate() !== dayNum) return null;

  const batchId = sizeFr ? `${year2}${monthCode}${day}-${sizeFr}` : `${year2}${monthCode}${day}`;
  return {
    year2,
    monthCode,
    monthName: MONTH_NAMES[monthIndex],
    monthIndex,
    day,
    sizeFr: sizeFr ?? "",
    date,
    batchId,
  };
}

/**
 * Lot code whose size suffix follows the selected size.
 *
 * Returns the rewritten code when `currentId` was composed from `batchDate`
 * (only the size suffix should move). Returns null when the field is empty
 * or the operator typed a lot from a different day — that code is left alone.
 */
export function batchIdFollowingSize(opts: {
  batchDate: string;
  size: string;
  currentId: string;
}): string | null {
  const next = buildBatchId(opts.batchDate, opts.size);
  if (!next) return null;
  const cur = formatBatchIdInput(opts.currentId);
  if (!cur) return null;
  const parsed = parseBatchId(cur);
  if (!parsed?.date || parsed.date !== opts.batchDate) return null;
  return next;
}

export function isValidBatchId(raw: string): boolean {
  const p = parseBatchId(raw);
  // Require size suffix for save validation (docs: full Batch ID)
  return !!p && !!p.sizeFr;
}

export { MONTH_CODES, MONTH_NAMES };

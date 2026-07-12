// src/core/workbook/header.ts
// Structural header detection for the workbook reader/profiler — relocated
// verbatim from the legacy parser.ts before its deletion (TDD §2.6).

function isDateLike(name: string, values: unknown[]): boolean {
  const n = name.toLowerCase();
  if (/month|year|date|period|week|quarter|day/.test(n)) return true;
  const sample = values.slice(0, 10).map(v => String(v ?? '').trim());
  const monthRe = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
  // Only treat a value as year-like when the WHOLE token is a plausible year
  // (1900–2099). The loose `/^\d{4}/` previously matched any value beginning
  // with 4 digits, so a 5-digit quantity (e.g. VISUAL QTY = 10982) was
  // misclassified as a date and never summed. Real Excel-serial dates are
  // handled separately by `looksSerialDate` (range 40000–60000).
  const yearRe = /^(19|20)\d{2}$/;
  return sample.filter(v => monthRe.test(v) || yearRe.test(v)).length >= 3;
}

const looksSerialDate = (vals: unknown[]): boolean => {
  const nums = vals.filter((v): v is number => typeof v === 'number');
  return nums.length >= 3 && nums.every(n => n >= 40000 && n <= 60000);
};

function serialToISO(n: number): string {
  return new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
}

// Collapse internal whitespace/newlines to a single space, trim, and de-duplicate
// repeated header names by suffixing ` (2)`, ` (3)`, … to the 2nd+ occurrence.
export function normalizeHeaders(rawHeader: unknown[]): string[] {
  const seen = new Map<string, number>();
  return rawHeader.map(cell => {
    const base = String(cell ?? '').replace(/\s+/g, ' ').trim();
    if (base === '') return base;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}


export function colIndexToLabel(idx: number): string {
  let label = "";
  let temp = idx;
  while (temp >= 0) {
    label = String.fromCharCode((temp % 26) + 65) + label;
    temp = Math.floor(temp / 26) - 1;
  }
  return label;
}

// A genuine column-header row contains at least one of these "hint" words.
// Requiring a hint stops a reason-code legend row (e.g. COAG | SD | TT | BL |
// PS | … | BST — 21 distinct short tokens, none of them a hint word) from
// out-scoring the real header (DATE | REC. QTY | ACCEPT QTY | … | REASON FOR
// REJ — only ~8 cells). Without this guard the legend row wins on raw distinct
// count and the quantity columns vanish, zeroing checked-qty. This mirrors the
// independent oracle in scripts/ground-truth.ts, which documents the same trap.
const HEADER_HINT_RE =
  /\bqty\b|\bdate\b|\bmonth\b|\byear\b|\bperiod\b|\brej\b|\brec\.?\b|receiv|\baccept|\bhold\b|reason|defect|production|dispatch|trolley|\bsize\b|\bb\.?\s*no\b|checked|inspect|balloon|valve|punch/i;

function rowHasHeaderHint(row: unknown[]): boolean {
  return row.some(c => typeof c === 'string' && HEADER_HINT_RE.test(c));
}

// Score each of the first 12 rows by its count of DISTINCT non-empty trimmed
// string cells; pick the highest-scoring row that is followed — within the next
// up to 4 NON-BLANK rows (blank spacer rows are skipped) — by a row containing
// ≥1 numeric cell. Real reports often place a blank spacer row between the
// header and the first data row, so an immediate-next-row check would reject the
// true header and wrongly promote a data row. A header row's cells are also
// predominantly strings, so rows with more numeric than distinct-string cells
// are not eligible (guards against a numeric data row outscoring the header).
//
// Two passes: prefer the best row that ALSO carries a header-hint word; only if
// no eligible row has a hint do we fall back to the best by raw distinct count
// (keeps behaviour for synthetic/odd files that lack hint words entirely).
export function detectHeaderRow(rawRows: unknown[][]): number {
  let bestIdx = 0;
  let bestScore = -1;
  let bestHintIdx = -1;
  let bestHintScore = -1;
  const limit = Math.min(rawRows.length, 12);
  for (let i = 0; i < limit; i++) {
    const row = rawRows[i] ?? [];
    const distinct = new Set(
      row
        .filter(c => typeof c === 'string' && (c as string).trim().length > 0)
        .map(c => (c as string).trim())
    );
    const score = distinct.size;

    // A header row should be predominantly strings, not numbers.
    const numericCells = row.filter(c => typeof c === 'number').length;
    if (numericCells >= distinct.size) continue;

    // Look ahead up to 4 non-blank rows for a numeric cell (skip blank spacers).
    let nextHasNum = false;
    let scanned = 0;
    for (let k = i + 1; k < rawRows.length && scanned < 4; k++) {
      const candidate = rawRows[k] ?? [];
      const isBlank = candidate.every(
        c => c === '' || c === null || c === undefined
      );
      if (isBlank) continue;
      scanned++;
      if (candidate.some(c => typeof c === 'number')) { nextHasNum = true; break; }
    }
    if (!nextHasNum) continue;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
    if (rowHasHeaderHint(row) && score > bestHintScore) {
      bestHintScore = score;
      bestHintIdx = i;
    }
  }
  if (bestHintIdx >= 0) return bestHintIdx;
  return bestScore >= 0 ? bestIdx : 0;
}

const SHORT_CODE_RE = /^[A-Za-z0-9 ./_+-]{1,8}$/;

function isHeaderLabelRow(row: unknown[]): boolean {
  const nonEmpty = row.filter(c => c !== '' && c !== null && c !== undefined);
  if (nonEmpty.length < 3) return false;
  return nonEmpty.every(c => {
    if (typeof c === 'number') return Number.isInteger(c) && Math.abs(c) <= 100;
    if (typeof c === 'string') return SHORT_CODE_RE.test(c.trim());
    return false;
  });
}

// Build the effective header from a header row plus any immediately-following
// label rows (sub-headers). Reports here use a two/three-row header: a main row
// (DATE | REC. QTY | … | REASON FOR REJ) whose reason-matrix columns are blank,
// then a "1 2 … 21" ordinal row, then a "COAG SD … BST" code row. For each
// column we prefer the most specific *string* sub-label found in the label rows
// (so a group header like "REASON FOR REJ" spanning the matrix is overridden by
// the per-column code beneath it), falling back to the main header cell.
// Numeric label cells (the ordinal row) are never used as names.
// Returns the merged header and the index where real data begins.
export function buildHeaderBlock(
  rawRows: unknown[][],
  headerRowIndex: number
): { header: unknown[]; dataStartIndex: number } {
  const base = rawRows[headerRowIndex] ?? [];
  const labelRows: unknown[][] = [];
  let dataStartIndex = headerRowIndex + 1;

  for (let k = headerRowIndex + 1; k < Math.min(headerRowIndex + 4, rawRows.length); k++) {
    const row = rawRows[k] ?? [];
    const blank = row.every(c => c === '' || c === null || c === undefined);
    if (blank) break;
    if (!isHeaderLabelRow(row)) break;
    labelRows.push(row);
    dataStartIndex = k + 1;
  }

  if (labelRows.length === 0) {
    return { header: base, dataStartIndex };
  }

  const width = Math.max(base.length, ...labelRows.map(r => r.length));
  const merged: unknown[] = [];
  for (let c = 0; c < width; c++) {
    let subLabel: string | null = null;
    for (const lr of labelRows) {
      const cell = lr[c];
      if (typeof cell === 'string' && cell.trim().length > 0) { subLabel = cell.trim(); break; }
    }
    merged[c] = subLabel ?? base[c] ?? '';
  }
  return { header: merged, dataStartIndex };
}

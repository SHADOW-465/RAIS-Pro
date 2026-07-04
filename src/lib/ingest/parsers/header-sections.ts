// Shared header-detection primitive for template-aware (not position-fixed)
// parsers. A "section" is a labelled block of columns: every non-empty cell
// in a header row starts a new section that runs until the next non-empty
// cell (or row end). Used to resolve each stage/inspection block's real
// column offsets from the sheet's OWN header text instead of a hardcoded
// index map, which breaks silently whenever the client's template changes.
export const norm = (c: unknown): string => String(c ?? "").replace(/\s+/g, " ").trim();

export interface HeaderSection { col: number; text: string; end: number }

/** Non-empty cells of a header row, sorted by column, each carrying the
 *  column range [col, end) it owns (up to the next non-empty cell, or rowLen). */
export function headerSections(row: unknown[], rowLen: number): HeaderSection[] {
  const cells: { col: number; text: string }[] = [];
  row.forEach((c, i) => { const t = norm(c); if (t) cells.push({ col: i, text: t }); });
  return cells.map((c, i) => ({ ...c, end: i + 1 < cells.length ? cells[i + 1].col : rowLen }));
}

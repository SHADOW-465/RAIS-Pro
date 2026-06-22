const XLSX = require('./node_modules/xlsx');
const path = require('path');

const BASE = 'C:\\Users\\acer\\Documents\\projects\\RAIS-Pro\\ANALYTICAL DATA';

const FILES = [
  path.join(BASE, 'REJECTION ANALYSIS 2025-26', '01 REJECTION ANALYSIS-APRIL 2025.xlsx'),
  path.join(BASE, 'REJECTION ANALYSIS 2025-26', 'YEARLY ANALYSIS.xlsx'),
  path.join(BASE, 'SIZE WISE REJECTION', 'VISUAL', '1 APRIL 26.xlsx'),
  path.join(BASE, 'SIZE WISE REJECTION', 'VALVE INTEGRITY', '1 APRIL 26.xlsx'),
  path.join(BASE, 'SIZE WISE REJECTION', 'FINAL', 'DAILY ACTIVITY REPORT 2025.xlsx'),
];

const MAX_COLS = 15;
const MAX_ROWS = 25;

function colLetter(idx) {
  let s = '';
  idx++; // 1-based
  while (idx > 0) {
    let rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

function renderGrid(rows, totalCols) {
  if (rows.length === 0) return '  (empty sheet)';
  const showCols = Math.min(totalCols, MAX_COLS);
  const header = ['ROW'].concat(Array.from({length: showCols}, (_, i) => colLetter(i).padEnd(20)));
  const lines = [];
  lines.push('  ' + header.join(' | '));
  lines.push('  ' + '-'.repeat(header.join(' | ').length));
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const cells = Array.from({length: showCols}, (_, c) => {
      const v = row[c];
      if (v === undefined || v === null || v === '') return ''.padEnd(20);
      const s = String(v);
      return (s.length > 20 ? s.slice(0, 17) + '...' : s).padEnd(20);
    });
    lines.push('  ' + String(r + 1).padStart(3) + ' | ' + cells.join(' | '));
  }
  if (totalCols > MAX_COLS) {
    lines.push(`  ... (${totalCols - MAX_COLS} more columns not shown, total cols: ${totalCols})`);
  }
  return lines.join('\n');
}

for (const filePath of FILES) {
  console.log('\n' + '='.repeat(100));
  console.log('FILE: ' + filePath);
  console.log('='.repeat(100));

  let wb;
  try {
    wb = XLSX.readFile(filePath, { cellDates: false, cellNF: false, cellStyles: false, sheetRows: 0 });
  } catch(e) {
    console.log('ERROR reading file: ' + e.message);
    continue;
  }

  console.log('SHEETS: ' + JSON.stringify(wb.SheetNames));

  for (const sheetName of wb.SheetNames) {
    console.log('\n' + '-'.repeat(80));
    console.log('SHEET: "' + sheetName + '"');
    console.log('-'.repeat(80));

    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      console.log('  (empty or no ref)');
      continue;
    }

    const range = XLSX.utils.decode_range(ws['!ref']);
    const totalRows = range.e.r - range.s.r + 1;
    const totalCols = range.e.c - range.s.c + 1;
    console.log(`  Range: ${ws['!ref']}  |  Total rows: ${totalRows}  |  Total cols: ${totalCols}`);

    // Read first MAX_ROWS rows using sheet_to_json with header:1
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });
    const showRows = allRows.slice(0, MAX_ROWS);

    // Determine actual max col count in shown rows
    const actualMaxCol = showRows.reduce((m, r) => Math.max(m, r.length), 0);

    console.log(`  Showing first ${Math.min(MAX_ROWS, allRows.length)} of ${allRows.length} rows, first ${Math.min(actualMaxCol, MAX_COLS)} of ${actualMaxCol} cols:`);
    console.log('');
    console.log(renderGrid(showRows, actualMaxCol));

    // Heuristic: look for summary indicators
    const flatText = allRows.slice(0, 60).map(r => r.join(' ')).join(' ').toLowerCase();
    const summaryHints = [];
    if (/total|grand total/.test(flatText)) summaryHints.push('contains TOTAL rows');
    if (/rejection %|rej %|% rejection/.test(flatText)) summaryHints.push('contains rejection % column');
    if (/monthly|month wise|month-wise/.test(flatText)) summaryHints.push('contains monthly breakdown');
    if (/stage|inprocess|final|pre-despatch|dispatch/.test(flatText)) summaryHints.push('contains stage-wise data');
    if (/april|may|june|july|august|september|october|november|december|january|february|march/.test(flatText)) summaryHints.push('contains month names (possible summary)');
    if (/yearly|annual|fy |2025-26|2026-27/.test(flatText)) summaryHints.push('yearly/FY summary data');
    if (/chart|graph/.test(flatText)) summaryHints.push('chart-related content');
    if (summaryHints.length > 0) {
      console.log('\n  [SUMMARY INDICATORS]: ' + summaryHints.join('; '));
    }
  }
}

console.log('\n' + '='.repeat(100));
console.log('DONE');

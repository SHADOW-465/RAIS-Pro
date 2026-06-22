// Inspect DAILY ACTIVITY REPORT files for defect data
const xlsx = require('xlsx');
const path = require('path');

const file = 'C:\\Users\\acer\\Documents\\MO!D\\New folder\\ANALYTICAL DATA\\SIZE WISE REJECTION\\FINAL\\DAILY ACTIVITY REPORT 2025.xlsx';
const wb = xlsx.readFile(file);
console.log('Sheets:', wb.SheetNames.slice(0, 5));

for (const sname of wb.SheetNames.slice(0, 3)) {
  const ws = wb.Sheets[sname];
  const json = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const rows = json.filter(r => Array.isArray(r) && r.some(v => v !== ''));
  console.log(`\n=== ${sname} ===`);
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    console.log(`Row:`, rows[i].slice(0, 15));
  }
}

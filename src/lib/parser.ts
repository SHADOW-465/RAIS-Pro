import * as XLSX from 'xlsx';

export interface ColumnSummary {
  name: string;
  type: string;
  min?: number | string;
  max?: number | string;
  uniqueCount: number;
  sampleData: any[];
}

export interface SheetSummary {
  name: string;
  rowCount: number;
  columns: ColumnSummary[];
}

export async function parseExcelFiles(files: File[]): Promise<SheetSummary[]> {
  const summaries: SheetSummary[] = [];

  for (const file of files) {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet);
      
      if (json.length === 0) continue;

      const columns = Object.keys(json[0] as object);
      const columnSummaries: ColumnSummary[] = columns.map(col => {
        const values = json.map((row: any) => row[col]).filter(v => v !== undefined && v !== null);
        const uniqueValues = new Set(values);
        const type = typeof values[0];
        
        const summary: ColumnSummary = {
          name: col,
          type: type,
          uniqueCount: uniqueValues.size,
          sampleData: values.slice(0, 5)
        };

        if (type === 'number') {
          summary.min = Math.min(...values as number[]);
          summary.max = Math.max(...values as number[]);
        }

        return summary;
      });

      summaries.push({
        name: `${file.name} - ${sheetName}`,
        rowCount: json.length,
        columns: columnSummaries
      });
    }
  }

  return summaries;
}

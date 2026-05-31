// Derives golden metric numbers under the entry-stage funnel definition.
// Run: npx tsx scripts/derive-golden.ts
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parseWorkbookBuffer } from "@/lib/parser";
import { inferSheetGraph, computeMetrics } from "@/lib/metrics";

const DATA = join(process.cwd(), "DATA");

for (const file of readdirSync(DATA).filter((f) => f.toLowerCase().endsWith(".xlsx"))) {
  const buf = readFileSync(join(DATA, file));
  const { summaries } = parseWorkbookBuffer(buf, file);
  const graphs = summaries.map(inferSheetGraph);
  const res = computeMetrics(summaries, graphs);
  const m = (id: string) => res.metrics.find((x) => x.id === id)!;
  console.log(`\n### ${file}`);
  console.log(`   reportType=${graphs[0]?.reportType}`);
  console.log(`   summarySheets=${graphs.filter((g) => g.isSummary).map((g) => g.sheetKey.split(" - ").slice(1).join(""))}`);
  console.log(`   checked=${m("checked_qty").value} accepted=${m("accepted_qty").value} rejected=${m("rejected_qty").value} hold=${m("hold_qty").value}`);
  console.log(`   rate=${m("rejection_rate").value} (${m("rejection_rate").display})`);
  console.log(`   stageBreakdown=${JSON.stringify(res.stageBreakdown.map((s) => ({ s: s.stage, c: Math.round(s.checked), r: Math.round(s.rejected), rate: +(s.rate * 100).toFixed(2) })))}`);
  console.log(`   topReasons=${JSON.stringify(res.reasonPareto.slice(0, 5).map((p) => ({ [p.label]: Math.round(p.value) })))}`);
  console.log(`   monthly=${JSON.stringify(res.monthlyTrend.map((p) => ({ [p.label]: +(p.value * 100).toFixed(2) })))}`);
}

// ─── reconciliation vs ASSEMBLY APRIL embedded Total row ────────────────────────
console.log("\n--- reconciliation (ASSEMBLY APRIL 25 single sheet) ---");
{
  const buf = readFileSync(join(DATA, "ASSEMBLY REJECTION REPORT.xlsx"));
  const { summaries } = parseWorkbookBuffer(buf, "ASSEMBLY REJECTION REPORT.xlsx");
  const apr = summaries.find((s) => s.name.toUpperCase().includes("APRIL"))!;
  const g = inferSheetGraph(apr);
  const res = computeMetrics([apr], [g]);
  const m = (id: string) => res.metrics.find((x) => x.id === id)!;
  const visualQty = apr.columns.find((c) => c.name === "VISUAL QTY")!.sum;
  const rej1 = apr.columns.find((c) => c.name === "REJ QTY")!.sum;
  const rej2 = apr.columns.find((c) => c.name === "REJ QTY (2)")!.sum;
  const rejV = apr.columns.find((c) => c.name === "VALVE INTY REJ Qty")!.sum;
  console.log(`   VISUAL QTY=${visualQty} (Total row 247767 ${visualQty === 247767 ? "MATCH" : "MISMATCH"})`);
  console.log(`   REJ QTY=${rej1} REJ QTY (2)=${rej2} VALVE INTY REJ Qty=${rejV}  sum=${(rej1 ?? 0) + (rej2 ?? 0) + (rejV ?? 0)}`);
  console.log(`   computed entry-stage checked=${m("checked_qty").value}  rejected(all stages)=${m("rejected_qty").value}`);
  console.log(`   expected rej (19271+1910+6101)=${19271 + 1910 + 6101}`);
}

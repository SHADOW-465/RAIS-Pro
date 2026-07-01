import type { Dataset, DatasetSource, ProfiledTableInput } from "./types";
import { deriveTitle } from "./title";

/** Group profiled tables by schema-signature hash into datasets. Pure and
 *  order-independent: sources and datasets are sorted deterministically, so the
 *  same input set in any order yields deep-equal output. */
export function groupIntoDatasets(inputs: ProfiledTableInput[]): Dataset[] {
  const byHash = new Map<string, ProfiledTableInput[]>();
  for (const inp of inputs) {
    const arr = byHash.get(inp.signature.hash);
    if (arr) arr.push(inp);
    else byHash.set(inp.signature.hash, [inp]);
  }

  const datasets: Dataset[] = [];
  for (const [hash, group] of byHash) {
    const sources: DatasetSource[] = group
      .map((g) => ({ fileName: g.fileName, sheetName: g.sheetName, rowCount: g.rowCount }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.sheetName.localeCompare(b.sheetName));
    const totalRows = sources.reduce((sum, s) => sum + s.rowCount, 0);
    const columns = group[0].signature.columns;
    datasets.push({
      id: hash,
      signatureHash: hash,
      title: deriveTitle(columns, sources),
      columns,
      sources,
      totalRows,
    });
  }

  // Stable order: largest datasets first, then alphabetical by title, then hash.
  return datasets.sort(
    (a, b) => b.totalRows - a.totalRows || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

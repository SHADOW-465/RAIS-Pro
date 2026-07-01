import type { Dataset, DatasetSource, ProfiledTableInput } from "./types";
import { deriveTitle } from "./title";

function basisKey(cols: { role: string; name: string }[]): string {
  return cols.map((c) => `${c.role}:${c.name}`).join("|");
}

/** Group profiled tables by schema-signature hash into datasets. Pure and
 *  order-independent: sources and datasets are sorted deterministically, so the
 *  same input set in any order yields deep-equal output.
 *
 *  Tables are grouped by hash AND the actual column basis, so a hash collision
 *  between two genuinely different schemas fails safe (kept as separate
 *  datasets) instead of silently merging unrelated tables. */
export function groupIntoDatasets(inputs: ProfiledTableInput[]): Dataset[] {
  const byKey = new Map<string, { hash: string; basis: string; group: ProfiledTableInput[] }>();

  for (const inp of inputs) {
    const hash = inp.signature.hash;
    const basis = basisKey(inp.signature.columns);
    const key = `${hash}::${basis}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { hash, basis, group: [] };
      byKey.set(key, entry);
    }
    entry.group.push(inp);
  }

  // Group the basis-groups by hash, then sort each hash's basis-groups by
  // their own basis string before assigning suffixes, so suffix assignment
  // is deterministic and independent of input order.
  const groupsByHash = new Map<string, { basis: string; group: ProfiledTableInput[] }[]>();
  for (const { hash, basis, group } of byKey.values()) {
    const arr = groupsByHash.get(hash);
    if (arr) arr.push({ basis, group });
    else groupsByHash.set(hash, [{ basis, group }]);
  }

  const datasets: Dataset[] = [];
  for (const [hash, basisGroups] of groupsByHash) {
    basisGroups.sort((a, b) => a.basis.localeCompare(b.basis));
    basisGroups.forEach(({ group }, i) => {
      const id = i === 0 ? hash : `${hash}-${i + 1}`;
      const sources: DatasetSource[] = group
        .map((g) => ({ fileName: g.fileName, sheetName: g.sheetName, rowCount: g.rowCount }))
        .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.sheetName.localeCompare(b.sheetName));
      const totalRows = sources.reduce((sum, s) => sum + s.rowCount, 0);
      const columns = group[0].signature.columns;
      datasets.push({
        id,
        signatureHash: hash,
        title: deriveTitle(columns, sources),
        columns,
        sources,
        totalRows,
      });
    });
  }

  // Stable order: largest datasets first, then alphabetical by title, then hash.
  return datasets.sort(
    (a, b) => b.totalRows - a.totalRows || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

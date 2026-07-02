import type { Dataset, DatasetSource, ProfiledTableInput } from "./types";
import { deriveTitle } from "./title";
import { recognizeSheetStage } from "./recognize";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";

function basisKey(cols: { role: string; name: string }[]): string {
  return cols.map((c) => `${c.role}:${c.name}`).join("|");
}

function stageLabel(stageId: string): string | null {
  return DISPOSAFE_REGISTRY.stages.find((s) => s.stageId === stageId)?.label ?? null;
}

/** Group profiled tables by schema-signature hash into datasets. Pure and
 *  order-independent: sources and datasets are sorted deterministically, so the
 *  same input set in any order yields deep-equal output.
 *
 *  Tables are grouped by hash AND the actual column basis, so a hash collision
 *  between two genuinely different schemas fails safe (kept as separate
 *  datasets) instead of silently merging unrelated tables.
 *
 *  Grouping is also STAGE-AWARE: the real corpus's VISUAL / BALLOON / VALVE /
 *  FINAL sheets share one column signature, and a signature-only grouping would
 *  merge four different stations' quantities into one dataset. Sheets that
 *  recognize as different Disposafe stages therefore land in different
 *  datasets, and a recognized dataset carries its stage id (labeling only —
 *  publishing to the canonical store stays an explicit user action). */
export function groupIntoDatasets(inputs: ProfiledTableInput[]): Dataset[] {
  const byKey = new Map<string, { hash: string; basis: string; stage: string | null; group: ProfiledTableInput[] }>();

  for (const inp of inputs) {
    const hash = inp.signature.hash;
    const basis = basisKey(inp.signature.columns);
    const stage = recognizeSheetStage(inp.fileName, inp.sheetName);
    const key = `${hash}::${basis}::${stage ?? ""}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { hash, basis, stage, group: [] };
      byKey.set(key, entry);
    }
    entry.group.push(inp);
  }

  // Group the sub-groups by hash, then sort each hash's sub-groups by their
  // own (basis, stage) before assigning suffixes, so suffix assignment is
  // deterministic and independent of input order.
  const groupsByHash = new Map<string, { basis: string; stage: string | null; group: ProfiledTableInput[] }[]>();
  for (const { hash, basis, stage, group } of byKey.values()) {
    const arr = groupsByHash.get(hash);
    if (arr) arr.push({ basis, stage, group });
    else groupsByHash.set(hash, [{ basis, stage, group }]);
  }

  const datasets: Dataset[] = [];
  for (const [hash, subGroups] of groupsByHash) {
    subGroups.sort((a, b) => a.basis.localeCompare(b.basis) || (a.stage ?? "").localeCompare(b.stage ?? ""));
    subGroups.forEach(({ stage, group }, i) => {
      const id = i === 0 ? hash : `${hash}-${i + 1}`;
      const sources: DatasetSource[] = group
        .map((g) => ({ fileName: g.fileName, sheetName: g.sheetName, rowCount: g.rowCount }))
        .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.sheetName.localeCompare(b.sheetName));
      const totalRows = sources.reduce((sum, s) => sum + s.rowCount, 0);
      const columns = group[0].signature.columns;
      // Defensive gate: a recognized stage only sticks when the dataset carries
      // at least one raw measure column — a stray filename coincidence on a
      // derived-only summary sheet must not become a recognized stage stream.
      const hasMeasure = columns.some((c) => c.role === "measure");
      const recognizedStageId = hasMeasure ? stage : null;
      // A recognized stream is named by its stage (far clearer in the View
      // dropdown); unrecognized groups keep the deterministic derived title.
      const title = (recognizedStageId && stageLabel(recognizedStageId)) || deriveTitle(columns, sources);
      datasets.push({
        id,
        signatureHash: hash,
        title,
        columns,
        sources,
        totalRows,
        recognizedStageId,
      });
    });
  }

  // Stable order: largest datasets first, then alphabetical by title, then hash.
  return datasets.sort(
    (a, b) => b.totalRows - a.totalRows || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

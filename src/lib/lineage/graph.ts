import type { BatchConversion, LineageNode } from "./types";
import { sizeOfLot } from "./ids";

function incoming(rows: BatchConversion[], to: string): BatchConversion | undefined {
  return rows.find((r) => r.toBatch === to);
}

function outgoing(rows: BatchConversion[], from: string): BatchConversion | undefined {
  return rows.find((r) => r.fromBatch === from);
}

function originOf(rows: BatchConversion[], batch: string): string {
  const seen = new Set<string>();
  let cur = batch;
  while (true) {
    if (seen.has(cur)) return cur;
    seen.add(cur);
    const prev = incoming(rows, cur);
    if (!prev) return cur;
    cur = prev.fromBatch;
  }
}

/**
 * Ordered chain from the original identity to the latest conversion.
 * Unknown lots return a single node so the page can still name them.
 */
export function lineageChain(batch: string, rows: BatchConversion[]): LineageNode[] {
  const origin = originOf(rows, batch);
  const chain: LineageNode[] = [
    {
      batch: origin,
      size: sizeOfLot(origin) ?? "",
      origin: true,
      via: null,
    },
  ];
  let cur = origin;
  const seen = new Set([cur]);
  while (true) {
    const next = outgoing(rows, cur);
    if (!next) break;
    if (seen.has(next.toBatch)) break;
    seen.add(next.toBatch);
    chain.push({
      batch: next.toBatch,
      size: next.toSize,
      origin: false,
      via: next,
    });
    cur = next.toBatch;
  }
  return chain;
}

export function isOnLineage(batch: string, rows: BatchConversion[]): boolean {
  return rows.some((r) => r.fromBatch === batch || r.toBatch === batch);
}

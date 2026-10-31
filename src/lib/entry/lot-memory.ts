// Pin a lot at Dipping and carry the same identity into Secondary and Assembly.
//
// The lot code is composed from its own date + size. Without a pin, changing
// Size (or a draft reload) rebuilds it. Memory stores the identity the
// operator just created so the rest of the line files against the same lot.

import { z } from "zod";
import { slot } from "@/lib/storage";

// parseLotMemory is the one judge of what a stored pin means, so the slot only
// asks "would parseLotMemory take it".
const lotMemorySlot = slot({
  name: "lot-memory",
  schema: z.unknown().refine((v) => parseLotMemory(JSON.stringify(v)) !== null),
  legacyKeys: ["moid_lot_memory"],
});

export type LotMemorySnapshot = {
  on: boolean;
  batchId: string;
  batchDate: string;
  size: string;
  category?: string;
  catheterType?: string;
  productType?: string;
};

export function parseLotMemory(raw: string | null | undefined): LotMemorySnapshot | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<LotMemorySnapshot>;
    if (!v || typeof v !== "object") return null;
    if (typeof v.batchId !== "string" || !v.batchId.trim()) return null;
    return {
      on: v.on === true,
      batchId: v.batchId.trim().toUpperCase(),
      batchDate: typeof v.batchDate === "string" ? v.batchDate : "",
      size: typeof v.size === "string" ? v.size : "",
      category: typeof v.category === "string" ? v.category : undefined,
      catheterType: typeof v.catheterType === "string" ? v.catheterType : undefined,
      productType: typeof v.productType === "string" ? v.productType : undefined,
    };
  } catch {
    return null;
  }
}

export function snapshotLotMemory(s: {
  on?: boolean;
  batchId: string;
  batchDate: string;
  size: string;
  category?: string;
  catheterType?: string;
  productType?: string;
}): LotMemorySnapshot {
  return {
    on: s.on !== false,
    batchId: s.batchId.trim().toUpperCase(),
    batchDate: s.batchDate,
    size: s.size,
    category: s.category,
    catheterType: s.catheterType,
    productType: s.productType,
  };
}

export function readLotMemory(): LotMemorySnapshot | null {
  if (typeof window === "undefined") return null;
  const stored = lotMemorySlot.get();
  return stored === undefined ? null : parseLotMemory(JSON.stringify(stored));
}

export function writeLotMemory(snap: LotMemorySnapshot | null): void {
  if (typeof window === "undefined") return;
  if (!snap || !snap.on) lotMemorySlot.remove();
  else lotMemorySlot.set(snap); // best-effort: private mode / quota just means no pin
}

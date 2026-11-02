"use client";

import { useEffect, useState } from "react";
import { useTweaks } from "@/components/editorial/TweaksContext";

export interface DateRange {
  from: string;
  to: string;
}

/** The global scope's window as a plain range; "all" means no bound. */
export function globalRange(t: { datePreset: string; dateFrom: string; dateTo: string }): DateRange {
  return t.datePreset === "all" ? { from: "", to: "" } : { from: t.dateFrom, to: t.dateTo };
}

/**
 * Page-level date filter that starts from the global Scope chip instead of its
 * own empty state. Editing it overrides the scope for this page only; changing
 * the chip again drops the override so the two never silently disagree.
 */
export function useScopedRange() {
  const { t } = useTweaks();
  const g = globalRange(t);
  const [override, setOverride] = useState<DateRange | null>(null);

  useEffect(() => {
    setOverride(null);
  }, [t.datePreset, t.dateFrom, t.dateTo]);

  const cur = override ?? g;
  return {
    from: cur.from,
    to: cur.to,
    setFrom: (from: string) => setOverride((p) => ({ from, to: (p ?? g).to })),
    setTo: (to: string) => setOverride((p) => ({ from: (p ?? g).from, to })),
    clear: () => setOverride({ from: "", to: "" }),
    followsScope: override === null && (g.from !== "" || g.to !== ""),
  };
}

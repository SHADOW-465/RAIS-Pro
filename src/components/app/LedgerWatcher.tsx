"use client";

// Reloads the screens when another user changes plant data. Asks
// /api/ledger-meta about once a minute (and when the tab comes back to the
// foreground); see lib/client/ledger-meta.ts. Renders nothing.

import { useEffect } from "react";
import { invalidateAfterWrite } from "@/lib/client/invalidate";
import {
  INITIAL_META_STATE,
  LEDGER_META_MIN_GAP_MS,
  LEDGER_META_POLL_MS,
  metaStep,
  readingFrom,
  type MetaReading,
} from "@/lib/client/ledger-meta";

export function LedgerWatcher() {
  useEffect(() => {
    let state = INITIAL_META_STATE;
    let lastCheck = 0;
    let stopped = false;

    const check = async (force: boolean) => {
      if (stopped || document.visibilityState === "hidden") return;
      const now = Date.now();
      if (!force && now - lastCheck < LEDGER_META_MIN_GAP_MS) return;
      lastCheck = now;
      let reading: MetaReading;
      try {
        reading = await readingFrom(
          await fetch("/api/ledger-meta", { cache: "no-store", credentials: "same-origin" }),
        );
      } catch {
        reading = { kind: "error" };
      }
      const step = metaStep(state, reading);
      state = step.state;
      if (step.stop) stopped = true;
      if (step.invalidate) void invalidateAfterWrite("remote");
    };

    void check(true);
    const onVisible = () => void check(false);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void check(true), LEDGER_META_POLL_MS);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}

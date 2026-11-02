"use client";

import { useEffect, useSyncExternalStore } from "react";
import { sharedStateWarning, subscribeSharedWarning } from "@/lib/shared-state/push";
import { refreshSharedState } from "@/lib/shared-state/sync";

/** Pulls plant shared settings once, and says so when the table is missing. */
export default function SharedStateBanner() {
  const warning = useSyncExternalStore(subscribeSharedWarning, sharedStateWarning, () => null);
  useEffect(() => {
    void refreshSharedState();
  }, []);
  if (!warning) return null;
  return (
    <div
      role="status"
      style={{
        padding: "8px 14px",
        margin: "0 0 12px",
        background: "var(--accent-weak)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        fontSize: 13,
        color: "var(--text)",
        lineHeight: 1.45,
      }}
    >
      {warning}
    </div>
  );
}

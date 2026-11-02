"use client";

// Tells an open tab that MOID was redeployed. Polls /api/version on focus and
// every few minutes; when the server's build differs from the one this tab
// loaded, a banner offers a reload. Also drops stale browser-storage values
// left by older builds (lib/storage.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BUILD_CHECK_MIN_GAP_MS,
  BUILD_POLL_MS,
  CLIENT_BUILD_ID,
  isNewBuild,
} from "@/lib/client/build-version";
import { sweepStaleStorage } from "@/lib/storage";

export function BuildWatcher() {
  const [stale, setStale] = useState(false);
  const lastCheck = useRef(0);

  const check = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastCheck.current < BUILD_CHECK_MIN_GAP_MS) return;
    lastCheck.current = now;
    try {
      const res = await fetch("/api/version", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return;
      const body = (await res.json()) as { buildId?: unknown };
      if (isNewBuild(CLIENT_BUILD_ID, body.buildId)) setStale(true);
    } catch {
      /* offline or restarting: try again on the next trigger */
    }
  }, []);

  useEffect(() => {
    sweepStaleStorage();
    if (!CLIENT_BUILD_ID || process.env.NODE_ENV === "development") return;
    void check(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void check(true), BUILD_POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [check]);

  if (!stale) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        background: "var(--ink, #111)",
        color: "var(--paper, #fff)",
        fontSize: 13,
      }}
    >
      <span>A new version of MOID is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: "4px 12px",
          borderRadius: 6,
          border: "1px solid currentColor",
          background: "transparent",
          color: "inherit",
          font: "inherit",
          cursor: "pointer",
        }}
      >
        New version – reload
      </button>
    </div>
  );
}

"use client";

// Shared by app/error.tsx (a route failed) and app/global-error.tsx (the root
// layout failed). On a chunk-load error — the tab is running a build that no
// longer exists — it reloads once on its own; anything else, or a second
// failure, gets a retry UI. Inline styles with fallbacks: global-error renders
// without the app's CSS.

import { useEffect, useState } from "react";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/client/chunk-reload";

export function ErrorScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const stale = isChunkLoadError(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error(error);
    if (reloadOnceForChunkError(error)) setReloading(true);
  }, [error]);

  const box = {
    minHeight: "60vh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    textAlign: "center" as const,
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
    color: "var(--text, #111)",
  };
  const button = {
    padding: "8px 16px",
    borderRadius: 6,
    border: "1px solid var(--border-strong, #999)",
    background: "var(--surface, #fff)",
    color: "inherit",
    font: "inherit",
    cursor: "pointer",
  };

  if (reloading) {
    return (
      <div role="status" style={box}>
        <p style={{ margin: 0 }}>A new version is available. Reloading…</p>
      </div>
    );
  }
  return (
    <div role="alert" style={box}>
      <h2 style={{ margin: 0, fontSize: 20 }}>{stale ? "This page is out of date" : "Something went wrong"}</h2>
      <p style={{ margin: 0, maxWidth: 480, fontSize: 14, opacity: 0.8 }}>
        {stale
          ? "MOID was updated while this tab was open. Reload to get the latest version."
          : "The page hit an unexpected error. Your saved data is not affected."}
        {error.digest ? ` (ref ${error.digest})` : ""}
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" style={button} onClick={stale ? () => window.location.reload() : retry}>
          {stale ? "Reload" : "Try again"}
        </button>
        {!stale && (
          <button type="button" style={button} onClick={() => window.location.reload()}>
            Reload page
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { checkSchemaEditPassword } from "@/lib/schema/edit-lock";

export default function SchemaEditUnlock({
  open,
  onUnlock,
  onCancel,
}: {
  open: boolean;
  onUnlock: () => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (!checkSchemaEditPassword(password)) {
      setError("Wrong password.");
      return;
    }
    onUnlock();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="schema-unlock-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "color-mix(in srgb, var(--ink) 45%, transparent)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{
          width: "min(400px, 100%)",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          boxShadow: "var(--shadow-lg)",
          padding: 20,
          display: "grid",
          gap: 12,
        }}
      >
        <div>
          <div
            id="schema-unlock-title"
            style={{ fontWeight: 600, fontSize: 16, marginBottom: 6, color: "var(--text)" }}
          >
            Unlock schema edit
          </div>
          <p className="small" style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.5 }}>
            The three plant sections stay fixed. Unlocking lets you add, rename
            or remove the stages and defects inside them.
          </p>
        </div>
        <label style={{ display: "grid", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Password
          </span>
          <input
            ref={inputRef}
            type="password"
            name="schema-edit-password"
            autoComplete="off"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="Enter edit password"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${error ? "var(--critical)" : "var(--border)"}`,
              background: "var(--surface-2)",
              color: "var(--text)",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
        </label>
        {error && (
          <p role="alert" className="small" style={{ color: "var(--critical)", margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-2)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!password}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "var(--on-accent)",
              cursor: password ? "pointer" : "default",
              opacity: password ? 1 : 0.6,
            }}
          >
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}

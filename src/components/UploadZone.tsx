"use client";

import { useCallback, useRef, useState } from "react";
import Icon from "@/components/editorial/Icon";

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
}

const ACCEPTED = [".xlsx", ".xls", ".csv"];

function isAccepted(file: File) {
  const lower = file.name.toLowerCase();
  return ACCEPTED.some((ext) => lower.endsWith(ext));
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter(isAccepted);
    if (valid.length === 0) return;
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...valid.filter((f) => !names.has(f.name))];
    });
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
  };

  const remove = (i: number) => setFiles((p) => p.filter((_, j) => j !== i));

  const analyze = () => {
    if (files.length > 0) onUpload(files);
  };

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${
            dragOver ? "var(--accent)" : "var(--hairline-strong)"
          }`,
          background: dragOver ? "var(--accent-soft)" : "var(--paper-soft)",
          padding: 56,
          transition: "all 0.2s ease",
          cursor: "pointer",
          borderRadius: "var(--card-radius)",
          position: "relative",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(",")}
          style={{ display: "none" }}
          onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
        />
        <div className="flex gap-6" style={{ alignItems: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              border: "1.5px solid var(--ink)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="upload" size={28} stroke={1.5} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              className="serif"
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              Drop spreadsheets here, or{" "}
              <span
                style={{
                  color: "var(--accent)",
                  textDecoration: "underline",
                }}
              >
                browse files
              </span>
            </div>
            <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>
              Multiple files welcome — rollup sheets are auto-detected and
              excluded from totals.
            </div>
            <div
              className="flex gap-2 mt-3"
              style={{ alignItems: "center", flexWrap: "wrap" }}
            >
              {["xlsx", "xls", "csv"].map((t) => (
                <span
                  key={t}
                  className="mono"
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    border: "1px solid var(--ink)",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  .{t}
                </span>
              ))}
              <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
                up to 50 MB · 12 files per session
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Queued files */}
      {files.length > 0 && (
        <div className="mt-6 fade-up">
          <div className="between mb-3">
            <div className="eyebrow">
              {files.length} file{files.length > 1 ? "s" : ""} queued
            </div>
            <button className="btn ghost sm" onClick={() => setFiles([])}>
              Clear all
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 8,
            }}
          >
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex gap-3"
                style={{
                  padding: "10px 12px",
                  background: "var(--paper-soft)",
                  border: "1px solid var(--hairline)",
                  alignItems: "center",
                }}
              >
                <Icon name="file" size={18} stroke={1.4} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.name}
                  </div>
                  <div className="muted mono" style={{ fontSize: 10 }}>
                    {(f.size / 1024).toFixed(1)} KB · .
                    {f.name.split(".").pop()?.toLowerCase()}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(i);
                  }}
                  style={{ color: "var(--muted)" }}
                  aria-label="Remove file"
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
          <div
            className="mt-6 flex gap-3"
            style={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <button className="btn accent" onClick={analyze}>
              <Icon name="spark" size={14} /> Analyze with RAIS
            </button>
            <div className="muted" style={{ fontSize: 12 }}>
              Estimated 12–25 sec
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

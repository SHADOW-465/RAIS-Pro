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
  const [rejections, setRejections] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: File[]) => {
    const valid: File[] = [];
    const newRejections: string[] = [];

    incoming.forEach((file) => {
      if (!isAccepted(file)) {
        newRejections.push(`${file.name} (Unsupported format. Only .xlsx, .xls, .csv allowed)`);
      } else if (file.size > 50 * 1024 * 1024) {
        newRejections.push(`${file.name} (File exceeds 50 MB limit)`);
      } else {
        valid.push(file);
      }
    });

    if (newRejections.length > 0) {
      setRejections(newRejections);
    } else {
      setRejections([]);
    }

    if (valid.length > 0) {
      setFiles((prev) => {
        const names = new Set(prev.map((f) => f.name));
        return [...prev, ...valid.filter((f) => !names.has(f.name))];
      });
    }
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
            dragOver ? "var(--accent)" : "var(--border-strong)"
          }`,
          background: dragOver ? "var(--accent-weak)" : "var(--surface)",
          padding: 56,
          transition: "all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
          cursor: "pointer",
          borderRadius: "var(--radius-lg)",
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
              width: 56,
              height: 56,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              borderRadius: "var(--radius-md)",
              transition: "transform 0.2s",
              transform: dragOver ? "scale(1.1) translateY(-2px)" : "none",
            }}
          >
            <Icon name="upload" size={24} stroke={1.5} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-0.02em",
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
                  className="num"
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    border: "1px solid var(--border-strong)",
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    fontWeight: 700,
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

      {/* Rejection Feedbacks */}
      {rejections.length > 0 && (
        <div className="mt-4 fade-up" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rejections.map((rej, idx) => (
            <div
              key={idx}
              className="flex gap-3"
              style={{
                background: "var(--critical-weak)",
                border: "1px solid var(--critical)",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                alignItems: "center",
                color: "var(--text)",
              }}
            >
              <Icon name="alert" size={14} style={{ color: "var(--critical)" }} />
              <span style={{ fontWeight: 600 }}>{rej}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRejections((prev) => prev.filter((_, i) => i !== idx));
                }}
                style={{ marginLeft: "auto", cursor: "pointer", opacity: 0.6 }}
                aria-label="Dismiss error"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Queued files */}
      {files.length > 0 && (
        <div className="mt-6 fade-up">
          <div className="between mb-3">
            <div className="eyebrow" style={{ fontWeight: 700 }}>
              {files.length} file{files.length > 1 ? "s" : ""} queued
            </div>
            <button className="btn ghost sm" onClick={() => { setFiles([]); setRejections([]); }}>
              Clear all
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex gap-3 card-hover"
                style={{
                  padding: "12px 14px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  alignItems: "center",
                  borderRadius: "var(--radius-md)",
                  animationDelay: `${i * 0.05}s`,
                }}
              >
                <Icon name="file" size={18} stroke={1.4} style={{ color: "var(--accent)" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.name}
                  </div>
                  <div className="muted num" style={{ fontSize: 10 }}>
                    {(f.size / 1024).toFixed(1)} KB · .
                    {f.name.split(".").pop()?.toLowerCase()}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(i);
                  }}
                  style={{ color: "var(--text-3)", cursor: "pointer" }}
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
            <div className="muted num" style={{ fontSize: 12 }}>
              Estimated 12–25 sec
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

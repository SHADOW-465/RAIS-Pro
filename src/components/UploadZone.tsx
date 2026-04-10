"use client";

import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
}

export default function UploadZone({ onUpload }: UploadZoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    const validFiles = droppedFiles.filter(file => 
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv')
    );
    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processFiles = () => {
    if (files.length > 0) {
      onUpload(files);
    }
  };

  return (
    <div className="glass-card p-8 text-center">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-accent bg-accent/5 scale-[1.01]"
            : "border-accent/30 hover:border-accent/50 hover:bg-white/30"
        }`}
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <Upload size={22} className="text-accent" />
        </div>

        <h2 className="text-lg font-bold text-text-primary mb-2">
          Drop your Excel files here
        </h2>
        <p className="text-sm text-text-muted mb-5">
          Start a new analysis session — multiple files supported
        </p>

        {/* Format badges + browse button */}
        <div className="flex gap-2 justify-center flex-wrap">
          {["XLSX", "XLS", "CSV"].map((fmt) => (
            <span
              key={fmt}
              className="bg-white/60 border border-white/80 rounded-full px-3 py-1 text-[11px] font-semibold text-slate-500"
            >
              {fmt}
            </span>
          ))}
          <label className="bg-white/60 border border-white/80 rounded-full px-3 py-1 text-[11px] font-semibold text-accent cursor-pointer hover:bg-white/80 transition-colors">
            Browse files
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  const selectedFiles = Array.from(e.target.files);
                  setFiles(prev => [...prev, ...selectedFiles]);
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* File list — rendered below the drop zone when files are queued */}
      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center justify-between bg-white/50 border border-white/70 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={16} className="text-accent" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{file.name}</p>
                  <p className="text-[10px] text-text-muted">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                className="text-text-muted hover:text-danger transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          <button
            onClick={processFiles}
            disabled={files.length === 0}
            className="btn-primary w-full mt-4"
          >
            Analyze with AI
          </button>
        </div>
      )}
    </div>
  );
}

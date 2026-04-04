"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, X, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    <div className="flex flex-col items-center gap-12 py-12">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-display font-bold text-accent tracking-tight">RAIS</h1>
        <p className="text-text-secondary font-condensed text-xl uppercase tracking-[0.2em]">
          Rejection Analysis & Intelligence System
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`w-full relative group transition-all duration-500 rounded-3xl p-1 bg-gradient-to-br ${
          isDragging ? 'from-accent via-accent/50 to-transparent' : 'from-accent/20 to-transparent'
        }`}
      >
        <div className="bg-surface/90 backdrop-blur-2xl rounded-[22px] p-12 flex flex-col items-center justify-center border border-white/5 min-h-[400px]">
          {/* Pulse Effect */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
            <div className={`w-64 h-64 rounded-full bg-accent/5 blur-3xl transition-transform duration-1000 ${isDragging ? 'scale-150 opacity-100' : 'scale-100 opacity-0'}`} />
          </div>

          <motion.div
            animate={isDragging ? { scale: 1.1 } : { scale: 1 }}
            className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 transition-colors duration-300 ${
              isDragging ? 'bg-accent text-background' : 'bg-accent/10 text-accent'
            }`}
          >
            <Upload size={40} />
          </motion.div>

          <h2 className="text-3xl font-display font-medium mb-4 text-text-primary">
            Drop your Excel files here
          </h2>
          <p className="text-text-secondary mb-8 font-condensed uppercase tracking-wider text-sm">
            Support for multi-file XLSX, XLS, and CSV analysis
          </p>

          <label className="btn-primary cursor-pointer">
            Browse Files
            <input
              type="file"
              multiple
              className="hidden"
              accept=".xlsx,.xls,.csv"
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

      {/* File List */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-2xl space-y-4"
          >
            <div className="flex items-center justify-between px-4 mb-2">
              <h3 className="font-condensed uppercase text-sm font-bold text-text-secondary">Ready for Analysis</h3>
              <span className="text-xs bg-accent/10 text-accent px-2 py-1 rounded-full">{files.length} Files</span>
            </div>
            {files.map((file, i) => (
              <motion.div
                key={`${file.name}-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass-card p-4 flex items-center justify-between group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-surface-raised flex items-center justify-center text-accent">
                    <FileText size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">{file.name}</p>
                    <p className="text-xs text-text-muted">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="p-2 text-text-muted hover:text-danger transition-colors"
                >
                  <X size={18} />
                </button>
              </motion.div>
            ))}
            
            <motion.button
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={processFiles}
              className="w-full btn-primary mt-8 py-4 text-lg"
            >
              Initialize Intelligence Scan
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-4 items-center text-text-muted mt-8">
        <div className="flex items-center gap-2 text-xs border border-white/5 py-1 px-3 rounded-full uppercase tracking-tighter">
          <AlertCircle size={14} /> XLSX
        </div>
        <div className="flex items-center gap-2 text-xs border border-white/5 py-1 px-3 rounded-full uppercase tracking-tighter">
          <AlertCircle size={14} /> XLS
        </div>
        <div className="flex items-center gap-2 text-xs border border-white/5 py-1 px-3 rounded-full uppercase tracking-tighter">
          <AlertCircle size={14} /> CSV
        </div>
      </div>
    </div>
  );
}

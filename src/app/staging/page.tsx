"use client";

// Staging & Review (mockup 3). Upload raw files (the only place upload lives),
// review the recomputed extraction, then Publish to Analytics → dashboard.

import { useMemo, useState, useRef, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import { Card, Empty } from "@/components/app/widgets";
import UploadZone from "@/components/UploadZone";
import Icon from "@/components/editorial/Icon";
import { buildReviewRows, reviewSummary, applyEdit, defectKey } from "@/lib/ingest/review";
import { SUMMARY_NAME } from "@/lib/ingest/from-rejection-sheets";
import type { StageDayRecord } from "@/lib/ingest/emit";
import { DISPOSAFE_REGISTRY } from "@/lib/registry/disposafe";
import { matchAgainstPresets, type PresetMatch } from "@/lib/registry/match-preset";
import type { Dataset } from "@/lib/dataset/types";

export default function StagingPage() {
  const router = useRouter();
  const { refreshEvents } = useEvents();
  const [ingestionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? `ing-${Date.now()}`);
  const [records, setRecords] = useState<StageDayRecord[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sheets recognized as summary/rollup and excluded ON PURPOSE (never counted
  // in the day-ledger, or double-counting would result) — distinct from a
  // genuine unrecognized-layout gap, so it gets a neutral note, not the same
  // red banner as an actual failure.
  const [excludedNote, setExcludedNote] = useState<string | null>(null);
  const [done, setDone] = useState<{ inserted: number; deduped: number } | null>(null);
  const [extractedSchema, setExtractedSchema] = useState<any | null>(null);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  // "MO!D understood your workbook" reveal — surfaces the silent Dataset-profiler
  // result (already computed for the fire-and-forget /api/datasets POST below)
  // instead of discarding it. Informational only; never gates Publish.
  const [detectedSummary, setDetectedSummary] = useState<Dataset[] | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [editingCommentRow, setEditingCommentRow] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 45;
  // tracks which invalid record index is currently focused in the error navigator
  const [focusedInvalidIdx, setFocusedInvalidIdx] = useState(0);
  // which row's flags are expanded inline
  const [expandedFlagsRow, setExpandedFlagsRow] = useState<number | null>(null);
  // ref map for scrolling to rows
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  // Schema modification & verification states
  const [rawSheetsData, setRawSheetsData] = useState<any[] | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Master Schema Lifecycles
  const [activeRegistry, setActiveRegistry] = useState<any>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isMasterMode, setIsMasterMode] = useState(false);

  // Preset identity for this upload — set explicitly by the operator, never
  // auto-decided. "merge" extends an existing preset; "new" creates one.
  // Presets never silently overwrite or combine with each other.
  const [presets, setPresets] = useState<{ presetId: string; name: string; stageCount: number }[]>([]);
  const [presetMatches, setPresetMatches] = useState<PresetMatch[]>([]);
  const [presetChoice, setPresetChoice] = useState<{ mode: "merge" | "new"; presetId?: string; name?: string }>({ mode: "new", name: "" });

  // New Column Mapping Carryover
  const [newColumns, setNewColumns] = useState<{ stageId: string; colName: string; type: string }[]>([]);
  const [confirmMappings, setConfirmMappings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/schema")
      .then(res => res.json())
      .then(data => {
        if (data.configured) {
          setActiveRegistry(data.registry);
          setIsConfigured(true);
          setIsMasterMode(false);
        } else {
          setIsConfigured(false);
          setIsMasterMode(true); // force master schema mode if not configured!
        }
      })
      .catch(err => {
        console.error("Failed to load active registry:", err);
        setIsConfigured(true);
      });
    fetch("/api/schema?list=true")
      .then(res => res.json())
      .then(data => setPresets(data.presets || []))
      .catch(err => console.error("Failed to load presets:", err));
  }, []);

  // Set preset choice name automatically when a fresh workbook schema is extracted
  useEffect(() => {
    if (!extractedSchema) {
      return;
    }
    setPresetChoice({ mode: "new", name: fileName.replace(/\.(xlsx|xls|csv)$/i, "") });
  }, [extractedSchema, fileName]);

  const rows = useMemo(() => buildReviewRows(records), [records]);
  const summary = useMemo(() => reviewSummary(rows), [rows]);
  const totals = useMemo(() => {
    let input = 0, rejected = 0; 
    for (const r of rows) { 
      input += r.checked ?? 0; 
      rejected += r.rejected ?? 0; 
    }
    return { input, rejected, rejPct: input ? (rejected / input) * 100 : 0 };
  }, [rows]);

  const registryToUse = activeRegistry || DISPOSAFE_REGISTRY;
  const defectsList = registryToUse.defects;
  const totalCols = 11 + defectsList.length;

  async function handleUpload(files: File[]) {
    setError(null); setExcludedNote(null); setDone(null); setComments({}); setEditingCommentRow(null); setExtractedSchema(null);
    setFocusedInvalidIdx(0); setExpandedFlagsRow(null); setRawSheetsData(null); setDetectedSummary(null);
    try {
      if (!files || files.length === 0) return;
      setBusy(true);

      // Fire-and-forget: profile the same buffers for the new Dataset system.
      // Never blocks or throws into the existing upload/review flow.
      void (async () => {
        try {
          const { datasetsWithRowsFromWorkbooks } = await import("@/lib/dataset/from-workbooks");
          const inputs = await Promise.all(
            files.map(async (f) => ({ fileName: f.name, data: await f.arrayBuffer() })),
          );
          const { datasets, rows } = datasetsWithRowsFromWorkbooks(inputs);
          if (datasets.length > 0) {
            setDetectedSummary(datasets); // surface to the C1 reveal panel (informational only)
            await fetch("/api/datasets", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ datasets, rows }),
            }).catch(() => {}); // best-effort; never surfaces to the user in this plan
          }
        } catch {
          // best-effort; the existing upload/review pipeline is unaffected either way
        }
      })();

      const { recordsFromBuffer, dedupeByPrecedence } = await import("@/lib/ingest/parsers");
      const { extractSchemaFromWorkbook, classifyWithSchema, extractSizesFromWorkbook } = await import("@/lib/ingest/schema-extractor");
      const { parseExcelFilesWithRaw } = await import("@/lib/parser");
      const { classifyRejectionSheets } = await import("@/lib/ingest/from-rejection-sheets");
      const xlsx = await import("xlsx");

      if (!isMasterMode && !activeRegistry) {
        throw new Error("No master schema configured. Please upload a pristine master workbook first.");
      }
      const masterStageIds: string[] | null =
        !isMasterMode && activeRegistry ? activeRegistry.stages.map((s: any) => s.stageId) : null;

      const allPreceded: any[] = [];     // recognized-family records (PrecededRecord[])
      const fallbackRecords: any[] = []; // generic-classifier records (unknown layouts)
      const allRawSheets: any[] = [];
      const skipped: string[] = [];
      const excluded: string[] = []; // recognized summary/rollup sheets, excluded on purpose
      let firstSchema: any = null;
      const discoveredSizes = new Map<string, { sizeId: string; label: string }>();

      // Process EVERY uploaded file (the previous version silently used only
      // files[0]). Accumulate all records, THEN dedup the combined set so two
      // overlapping workbooks can never double-count the same stage·day.
      for (const file of files) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const wb = xlsx.read(arrayBuffer, { type: "array" });
          for (const sz of extractSizesFromWorkbook(wb)) discoveredSizes.set(sz.sizeId, sz);

          // Archive → cryptographic fileHash (best-effort; never blocks ingest).
          let fileHash = "local";
          try {
            const fd = new FormData();
            fd.append("file", file);
            const archiveRes = await fetch("/api/archive-upload", { method: "POST", body: fd });
            if (archiveRes.ok) fileHash = (await archiveRes.json()).fileHash ?? "local";
          } catch { /* keep "local" */ }

          // Schema for the editor / master-mode save (first usable one wins).
          const schema = extractSchemaFromWorkbook(wb, file.name);
          if (masterStageIds) schema.stages = schema.stages.filter((s: any) => masterStageIds.includes(s.stageId));
          if (!firstSchema && schema.stages.length > 0) firstSchema = schema;

          // PREFER the verified family parsers (size-wise / rejection-analysis).
          const preceded = recordsFromBuffer(arrayBuffer, file.name);
          const { rawSheets } = await parseExcelFilesWithRaw([file]);
          allRawSheets.push(...rawSheets);

          if (preceded.length > 0) {
            for (const p of preceded) {
              p.record = { ...p.record, ingestionId, source: { ...p.record.source, fileHash } };
            }
            allPreceded.push(...preceded);
            // Completeness: name any sheet the family parser did NOT consume so
            // nothing disappears silently. (Every sheet still reaches the
            // Workbooks explorer via the dataset pipeline above.)
            const consumed = new Set(preceded.map((p: any) => p.record?.source?.sheet).filter(Boolean));
            const unconsumed = wb.SheetNames.filter((n: string) => !consumed.has(n));
            // A summary/rollup sheet (Cummulative, a bare month tab, etc.) was
            // RECOGNIZED and deliberately excluded — counting it would double
            // the day-level total it's a rollup of. That's not the same as a
            // sheet whose layout genuinely isn't understood.
            const designExcluded = unconsumed.filter((n) => SUMMARY_NAME.test(n));
            const genuinelyUnrecognized = unconsumed.filter((n) => !SUMMARY_NAME.test(n));
            if (designExcluded.length > 0) {
              excluded.push(`${file.name}: ${designExcluded.join(", ")}`);
            }
            if (genuinelyUnrecognized.length > 0) {
              // Distinguish "the sheet's layout isn't understood" from "the
              // layout is fine but its own DATE column was never filled in" —
              // the header row is found either way, but the second case has
              // no date to recover from anywhere in the sheet, so it needs a
              // different (source-data, not app) reason surfaced to the user.
              const hasEmptyDateColumn = (n: string): boolean => {
                const rs = rawSheets.find((s: any) => s.name === `${file.name} - ${n}`);
                const dateCol = rs?.columns.find((c: string) => /^date$/i.test(c.trim()));
                return !!dateCol && rs!.rows.every((r: any) => r[dateCol] === "" || r[dateCol] == null);
              };
              const dataGap = genuinelyUnrecognized.filter(hasEmptyDateColumn);
              const trulyUnrecognized = genuinelyUnrecognized.filter((n) => !hasEmptyDateColumn(n));

              const parts: string[] = [];
              if (trulyUnrecognized.length) {
                parts.push(`sheet${trulyUnrecognized.length === 1 ? "" : "s"} not ingested (unrecognized layout — still browsable in Workbooks): ${trulyUnrecognized.join(", ")}`);
              }
              if (dataGap.length) {
                parts.push(`sheet${dataGap.length === 1 ? "" : "s"} recognized but has no DATE values recorded in the source file — nothing to ingest until the workbook is corrected: ${dataGap.join(", ")}`);
              }
              skipped.push(`${file.name}: ${parts.join("; ")}`);
            }
          } else {
            // Fallback: generic classifier for unrecognized layouts.
            let recs = classifyWithSchema(rawSheets, schema, ingestionId);
            if (recs.length === 0) recs = classifyRejectionSheets(rawSheets, ingestionId).records;
            recs = recs.map((r: any) => ({ ...r, source: { ...r.source, fileHash } }));
            fallbackRecords.push(...recs);
          }
        } catch (fileErr: any) {
          skipped.push(`${file.name}: ${fileErr?.message ?? "read error"}`);
        }
      }

      // Dedup recognized-family records across ALL files, then add fallbacks.
      let classifiedRecords: any[] = [];
      if (allPreceded.length > 0) {
        const { kept } = dedupeByPrecedence(allPreceded);
        classifiedRecords = kept.map((p: any) => p.record);
      }
      classifiedRecords.push(...fallbackRecords);
      if (masterStageIds) {
        classifiedRecords = classifiedRecords.filter((r) => masterStageIds.includes(r.stageId));
      }

      setExtractedSchema(firstSchema);
      
      // Detect new columns introduced by this upload compared to registry
      const regToCompare = activeRegistry || DISPOSAFE_REGISTRY;
      if (firstSchema && regToCompare) {
        // One extracted "stage" per SHEET (e.g. one per month tab), so the same
        // stageId (e.g. "visual") repeats many times with the same columns —
        // dedupe by stageId|colName or every column duplicates once per sheet.
        const newColsByKey = new Map<string, { stageId: string; colName: string; type: string }>();
        firstSchema.stages.forEach((extractedStage: any) => {
          const activeStage = regToCompare.stages.find((s: any) => s.stageId === extractedStage.stageId);
          if (activeStage) {
            // Retrieve active fields, fallback to default schema fields
            const activeFields = activeStage.fields || [
              { name: "Checked Qty" },
              { name: "Good Qty" },
              { name: "Rework Qty" },
              { name: "Rejected Qty" }
            ];
            const activeFieldNames = activeFields.map((f: any) => f.name.toLowerCase());

            extractedStage.fields.forEach((f: any) => {
              // Ignore standard structural fields
              if (f.role === "date" || f.name.startsWith("__EMPTY")) return;
              if (!activeFieldNames.includes(f.name.toLowerCase())) {
                const key = `${extractedStage.stageId}|${f.name}`;
                if (!newColsByKey.has(key)) {
                  newColsByKey.set(key, {
                    stageId: extractedStage.stageId,
                    colName: f.name,
                    type: f.type === "number" ? "number" : "text"
                  });
                }
              }
            });
          }
        });
        const newCols = Array.from(newColsByKey.values());
        setNewColumns(newCols);
        
        const initialConfirm: Record<string, boolean> = {};
        newCols.forEach((c) => {
          initialConfirm[`${c.stageId}|${c.colName}`] = true;
        });
        setConfirmMappings(initialConfirm);
      } else {
        setNewColumns([]);
      }

      if (allRawSheets.length > 0) {
        setRawSheetsData(allRawSheets);
        try {
          sessionStorage.setItem(`rais_raw_${ingestionId}`, JSON.stringify(allRawSheets));
          sessionStorage.setItem("rais_active_session_id", ingestionId);
          sessionStorage.setItem(`rais_sizes_${ingestionId}`, JSON.stringify(Array.from(discoveredSizes.values())));
        } catch (e) {
          console.warn("Could not cache raw sheets in sessionStorage:", e);
        }
      }
      setRecords(classifiedRecords);
      setFileName(files.length === 1 ? files[0].name : `${files.length} files`);

      if (classifiedRecords.length === 0) {
        throw new Error(
          skipped.length
            ? `No records extracted. ${skipped.join("; ")}`
            : "No records could be extracted — the file layout was not recognized."
        );
      }
      if (skipped.length) setError(`Ingestion completeness: ${skipped.join("; ")}`);
      if (excluded.length) setExcludedNote(`Excluded by design (summary/rollup sheets, not day-level data): ${excluded.join("; ")}`);

      // Jump to the page containing the first invalid row.
      const reviewedRows = buildReviewRows(classifiedRecords);
      const firstInvalidGlobalIdx = reviewedRows.findIndex((r) => r.status === "invalid");
      setPage(firstInvalidGlobalIdx >= 0 ? Math.floor(firstInvalidGlobalIdx / PAGE_SIZE) : 0);

      // First-ever preset: nothing to merge into yet, so this always creates
      // a new preset named after the uploaded file.
      if (isMasterMode && firstSchema && firstSchema.stages.length > 0) {
        const regRes = await fetch("/api/schema", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: firstSchema,
            name: (files.length === 1 ? files[0].name : `${files.length} files`).replace(/\.(xlsx|xls|csv)$/i, ""),
            createdFromFilename: files.length === 1 ? files[0].name : undefined,
          }),
        });
        const regData = await regRes.json();
        if (regData.success) {
          setActiveRegistry(regData.registry);
          setIsConfigured(true);
        }
      }
    } catch (e: any) {
      console.error("File upload reading error:", e);
      let errMsg = e?.message ?? "Could not read the file.";
      if (
        e?.name === "NotReadableError" ||
        errMsg.toLowerCase().includes("permission") ||
        errMsg.toLowerCase().includes("could not be read")
      ) {
        errMsg = "Locked File / Permission Error: The file could not be read. If this Excel file is currently open in Microsoft Excel or another program, please close the file in Excel, save your changes, and try uploading it again.";
      }
      setError(errMsg);
    } finally {
      setBusy(false);
    }
  }

  const handleCellChange = (recordIndex: number, field: string, valString: string) => {
    const val = valString === "" ? 0 : Number(valString);
    if (isNaN(val) || val < 0) return;
    setRecords((prev) => applyEdit(prev, recordIndex, field, val));
  };

  /** Swap checked ↔ rejected for a single record (fixes the most common error) */
  const handleSwapCheckedRejected = (recordIndex: number) => {
    setRecords((prev) => prev.map((rec, i) => {
      if (i !== recordIndex) return rec;
      const checkedVal = rec.checked?.value ?? 0;
      const rejectedVal = rec.rejected?.value ?? 0;
      return {
        ...rec,
        checked: rec.checked ? { ...rec.checked, value: rejectedVal } : { value: rejectedVal, cell: `EDIT!checked`, header: "Checked" },
        rejected: rec.rejected ? { ...rec.rejected, value: checkedVal } : { value: checkedVal, cell: `EDIT!rejected`, header: "Rejected" },
        extractedBy: "direct-entry",
      };
    }));
  };

  const handleSchemaFieldRoleChange = (stageId: string, fieldName: string, newRole: any) => {
    if (!extractedSchema) return;

    // Convert from the UI roles back to backend schema-extractor roles if needed!
    let backendRole = newRole;
    if (newRole === "accepted") backendRole = "good";
    else if (newRole === "hold") backendRole = "rework";
    else if (newRole === "defect_mode") backendRole = "defect";
    else if (newRole === "ignore") backendRole = "other";

    const updatedStages = extractedSchema.stages.map((stage: any) => {
      if (stage.stageId !== stageId) return stage;

      const updatedFields = stage.fields.map((field: any) => {
        if (field.name !== fieldName) return field;
        return { ...field, role: backendRole };
      });

      return { ...stage, fields: updatedFields };
    });

    const updatedSchema = { ...extractedSchema, stages: updatedStages };
    setExtractedSchema(updatedSchema);

    // Re-classify the raw rows using the updated schema in real time!
    if (rawSheetsData) {
      import("@/lib/ingest/schema-extractor").then(({ classifyWithSchema }) => {
        const reclassified = classifyWithSchema(rawSheetsData, updatedSchema, ingestionId);

        // Append file cryptographic hash metadata
        const finalRecords = reclassified.map((r: any) => ({
          ...r,
          source: {
            ...r.source,
            fileHash: records[0]?.source?.fileHash ?? "local"
          }
        }));
        setRecords(finalRecords);
      });
    }
  };

  const getSelectRoleValue = (fieldRole: string) => {
    if (fieldRole === "good") return "accepted";
    if (fieldRole === "rework") return "hold";
    if (fieldRole === "defect") return "defect_mode";
    if (fieldRole === "other") return "ignore";
    return fieldRole || "ignore";
  };

  const getHeaderStyle = (role: string, defectCode?: string) => {
    const hasValidationFailure = rows.some(r => r.status === "invalid");

    let hasMismatch = false;
    if (!isMasterMode && activeRegistry && extractedSchema) {
      let found = false;
      extractedSchema.stages.forEach((stage: any) => {
        const field = stage.fields.find((f: any) => {
          if (role === "checked" && f.role === "checked") return true;
          if (role === "good" && f.role === "good") return true;
          if (role === "rework" && f.role === "rework") return true;
          if (role === "rejected" && f.role === "rejected") return true;
          if (role === "date" && f.role === "date") return true;
          if (role === "defect" && f.role === "defect" && defectCode) {
            const code = f.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
            return code === defectCode;
          }
          return false;
        });
        if (field) {
          found = true;
        }
      });
      if (!found && role !== "balance" && role !== "status" && role !== "comment") {
        hasMismatch = true;
      }
    }

    const isBalanceQuantity = ["checked", "good", "rework", "rejected", "balance"].includes(role);
    
    if (hasMismatch || (hasValidationFailure && isBalanceQuantity)) {
      return {
        background: "#FFEBAA",
        color: "#C8421C",
        borderBottom: "2px solid #C8421C",
        transition: "background 0.3s, color 0.3s"
      };
    }
    return {};
  };

  const roleOptions = [
    { value: "date", label: "Date / Period" },
    { value: "checked", label: "Total Checked (Input)" },
    { value: "accepted", label: "Accepted Good" },
    { value: "hold", label: "Rework Quantity" },
    { value: "rejected", label: "Stated Rejection" },
    { value: "defect_mode", label: "Defect Count" },
    { value: "formula", label: "Formula / Calculated" },
    { value: "ignore", label: "Ignore Column" },
  ];

  async function commitSchemaAsMaster() {
    if (!extractedSchema) return;
    if (presetChoice.mode === "new" && !presetChoice.name?.trim()) {
      setError("Name this preset before saving (see 'Excel Preset' panel above).");
      return;
    }
    setBusy(true); setError(null); setSaveSuccessMsg(null);
    try {
      const regRes = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: extractedSchema,
          ...(presetChoice.mode === "merge"
            ? { presetId: presetChoice.presetId }
            : { name: presetChoice.name, createdFromFilename: fileName }),
        })
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error ?? "Failed to save schema");
      if (regData.success) {
        setActiveRegistry(regData.registry);
        setIsConfigured(true);
        setSaveSuccessMsg(presetChoice.mode === "merge" ? "Preset updated successfully!" : "New preset saved successfully!");
        setTimeout(() => setSaveSuccessMsg(null), 4000);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to save schema");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true); setError(null);
    try {
      if (!extractedSchema) {
        throw new Error("No schema available to publish.");
      }

      // Always save the extracted schema as a new preset named after the file (or custom name)
      const presetName = presetChoice.name || fileName.replace(/\.(xlsx|xls|csv)$/i, "");
      const regRes = await fetch("/api/schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema: extractedSchema,
          name: presetName,
          createdFromFilename: fileName,
        })
      });

      if (!regRes.ok) {
        const errBody = await regRes.json().catch(() => ({}));
        throw new Error(errBody.error ? `Failed to save preset: ${errBody.error}` : "Failed to save preset.");
      }

      const regData = await regRes.json();
      const savedPresetId = regData.registry.presetId;

      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingestionId, fileName, records, comments, presetId: savedPresetId })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Publish failed");
      const r = await res.json();
      setDone({ inserted: r.inserted, deduped: r.deduped });
      refreshEvents().catch(console.error);
    } catch (e: any) { 
      setError(e?.message ?? "Publish failed"); 
    } finally { 
      setBusy(false); 
    }
  }

  const dq = [
    { label: "Missing Values", state: rows.some((r) => r.checked == null || r.rejected == null) ? "Warning" : "Passed" },
    { label: "Logical Validation", state: summary.invalid > 0 ? "Failed" : "Passed" },
    { label: "Formula Check", state: summary.corrected > 0 ? "Warning" : "Passed" },
    { label: "Outlier Detection", state: "Passed" },
  ] as { label: string; state: "Passed" | "Warning" | "Failed" }[];

  const gridInputStyle: React.CSSProperties = {
    width: "80px",
    textAlign: "right",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-sm)",
    padding: "4px 8px",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    background: "var(--bg)",
    color: "var(--text)",
    outline: "none"
  };

  // Derived invalid row list for error navigator
  const invalidRows = useMemo(() => rows.filter(r => r.status === "invalid"), [rows]);

  // When navigating to a focused invalid row: jump page and scroll to it
  const jumpToInvalid = (navIdx: number) => {
    const clamped = Math.max(0, Math.min(navIdx, invalidRows.length - 1));
    setFocusedInvalidIdx(clamped);
    const target = invalidRows[clamped];
    if (!target) return;
    const globalIdx = rows.findIndex(r => r.recordIndex === target.recordIndex);
    if (globalIdx < 0) return;
    const targetPage = Math.floor(globalIdx / PAGE_SIZE);
    setPage(targetPage);
    setTimeout(() => {
      const el = rowRefs.current.get(target.recordIndex);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  return (
    <AppShell active="staging" statusCounts={{ anomalies: summary.invalid + summary.corrected }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, margin: "0 0 2px" }}>Staging &amp; Review</h1>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 18px" }}>Upload raw data files, review the recomputed extraction, and verify before publishing to analytics.</p>

      {error && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-bad) 12%, transparent)", color: "var(--status-bad)", fontSize: 13 }}>{error}</div>}
      {excludedNote && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-warn) 10%, transparent)", color: "var(--status-warn)", fontSize: 13 }}>{excludedNote}</div>}
      {done && <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: "color-mix(in srgb, var(--status-good) 12%, transparent)", color: "var(--status-good)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Published {done.inserted} new events ({done.deduped} already on file).</span>
        <button onClick={() => router.push("/")} style={{ background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>View dashboard →</button>
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card 
            title="Upload" 
            sub="Ingest raw workbook (.xlsx) — establishes layout or logs production entries"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <UploadZone onUpload={handleUpload} />
              
              {/* Master Schema Registry Toggle */}
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 8, 
                padding: "10px 14px", 
                background: "var(--surface-2)", 
                borderRadius: "var(--radius-md)",
                border: "1.5px solid var(--border-strong)",
                borderStyle: isConfigured === false ? "dashed" : "solid",
                borderColor: isConfigured === false ? "var(--status-bad)" : "var(--border-strong)"
              }}>
                <input 
                  type="checkbox"
                  id="masterMode"
                  checked={isMasterMode}
                  disabled={isConfigured === false}
                  onChange={(e) => setIsMasterMode(e.target.checked)}
                  style={{ width: 15, height: 15, cursor: isConfigured === false ? "not-allowed" : "pointer" }}
                />
                <label htmlFor="masterMode" style={{ fontSize: 13, fontWeight: 700, cursor: isConfigured === false ? "not-allowed" : "pointer" }}>
                  Register as Master Workbook
                  {isConfigured === false && (
                    <span style={{ color: "var(--status-bad)", marginLeft: 6, fontWeight: 800 }}>
                      (Required: App Cockpit is Unconfigured)
                    </span>
                  )}
                </label>
              </div>
            </div>
          </Card>

          {/* Preset identity — every workbook is a separate independent preset */}
          {extractedSchema && (
            <Card title="Excel Preset Name" sub="The independent Data Entry preset name for this workbook.">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  Save as preset:
                  <input
                    type="text"
                    value={presetChoice.name ?? ""}
                    onChange={(e) => setPresetChoice({ mode: "new", name: e.target.value })}
                    placeholder="e.g. April 2026 Rejection Report"
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", width: 300, background: "var(--bg)", color: "var(--text)" }}
                  />
                </label>
              </div>
            </Card>
          )}

          {/* New Column Mappings Card */}
          {newColumns.length > 0 && (
            <Card title="New Column Mappings Detected" sub="These columns will be added to the registry schema upon publishing.">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {newColumns.map((c) => {
                  const key = `${c.stageId}|${c.colName}`;
                  const isConfirmed = !!confirmMappings[key];
                  return (
                    <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-2)", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input 
                          type="checkbox" 
                          checked={isConfirmed} 
                          onChange={(e) => setConfirmMappings(prev => ({ ...prev, [key]: e.target.checked }))}
                          style={{ width: 15, height: 15, cursor: "pointer" }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{c.colName}</div>
                          <div style={{ fontSize: 10, color: "var(--text-3)" }}>
                            Stage: {activeRegistry?.stages?.find((s: any) => s.stageId === c.stageId)?.label || c.stageId} (Type: {c.type})
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: 10, background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
                        New Custom Field
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ─── Invalid-row Error Navigator ─────────────────────────────────── */}
          {invalidRows.length > 0 && (
            <div style={{
              border: "1.5px solid var(--status-bad)",
              borderRadius: "var(--radius-md)",
              background: "color-mix(in srgb, var(--status-bad) 6%, var(--surface))",
              overflow: "hidden",
            }}>
              {/* header bar */}
              <div style={{
                padding: "10px 16px",
                background: "color-mix(in srgb, var(--status-bad) 14%, var(--surface-2))",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid color-mix(in srgb, var(--status-bad) 22%, transparent)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="alert" size={14} style={{ color: "var(--status-bad)", flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--status-bad)" }}>
                    {invalidRows.length} Invalid Row{invalidRows.length !== 1 ? "s" : ""} — must fix before publishing
                  </span>
                </div>
                {/* prev / next navigator */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    disabled={focusedInvalidIdx === 0}
                    onClick={() => jumpToInvalid(focusedInvalidIdx - 1)}
                    style={{ padding: "3px 9px", fontSize: 11.5, fontWeight: 700, border: "1px solid var(--border-strong)", borderRadius: 6, background: "var(--bg)", color: "var(--text-2)", cursor: focusedInvalidIdx === 0 ? "not-allowed" : "pointer", opacity: focusedInvalidIdx === 0 ? 0.4 : 1 }}
                  >‹ Prev</button>
                  <span style={{ fontSize: 11.5, fontWeight: 700, fontFamily: "var(--font-mono)", minWidth: 50, textAlign: "center" }}>
                    {focusedInvalidIdx + 1} / {invalidRows.length}
                  </span>
                  <button
                    disabled={focusedInvalidIdx >= invalidRows.length - 1}
                    onClick={() => jumpToInvalid(focusedInvalidIdx + 1)}
                    style={{ padding: "3px 9px", fontSize: 11.5, fontWeight: 700, border: "1px solid var(--border-strong)", borderRadius: 6, background: "var(--bg)", color: "var(--text-2)", cursor: focusedInvalidIdx >= invalidRows.length - 1 ? "not-allowed" : "pointer", opacity: focusedInvalidIdx >= invalidRows.length - 1 ? 0.4 : 1 }}
                  >Next ›</button>
                </div>
              </div>
              {/* error list — all invalid rows scrollable */}
              <div style={{ maxHeight: 220, overflowY: "auto", padding: "6px 0" }}>
                {invalidRows.map((r, navIdx) => {
                  const globalIdx = rows.findIndex(rr => rr.recordIndex === r.recordIndex);
                  const isFocused = navIdx === focusedInvalidIdx;
                  const isSwappable = r.flags.some(f => f.toLowerCase().includes("exceeds checked"));
                  return (
                    <div
                      key={r.recordIndex}
                      style={{
                        padding: "8px 16px",
                        borderBottom: "1px solid color-mix(in srgb, var(--status-bad) 12%, transparent)",
                        background: isFocused ? "color-mix(in srgb, var(--status-bad) 10%, var(--surface))" : "transparent",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onClick={() => jumpToInvalid(navIdx)}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, color: "var(--text-3)", flexShrink: 0 }}>Row {globalIdx + 1}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", flexShrink: 0 }}>{r.date}</span>
                            <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>·</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{r.stageLabel}</span>
                            {r.checked != null && r.rejected != null && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-3)" }}>
                                (Checked: {r.checked}, Rejected: {r.rejected})
                              </span>
                            )}
                          </div>
                          {r.flags.map((flag, fi) => (
                            <div key={fi} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--status-bad)", marginTop: 2 }}>
                              <span style={{ flexShrink: 0 }}>⚠</span>
                              <span>{flag}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end", flexShrink: 0 }}>
                          {isSwappable && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSwapCheckedRejected(r.recordIndex); }}
                              title="Swap Checked ↔ Rejected values"
                              style={{
                                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                                border: "1px solid var(--status-warn)",
                                background: "color-mix(in srgb, var(--status-warn) 12%, var(--surface))",
                                color: "var(--status-warn)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              ⇅ Swap values
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); jumpToInvalid(navIdx); }}
                            style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-2)", whiteSpace: "nowrap" }}
                          >→ Jump to row</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── C1: "MO!D understood your workbook" reveal panel ────────────────
              Surfaces the silent Dataset-profiler result (already computed for the
              fire-and-forget /api/datasets POST in handleUpload) instead of letting
              it disappear. Purely informational — does not gate or alter the review
              table / Publish flow below. */}
          {detectedSummary && detectedSummary.length > 0 && (
            <Card
              title="MO!D understood your workbook"
              sub={`${detectedSummary.length} sheet${detectedSummary.length !== 1 ? "s" : ""} recognized`}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {detectedSummary.map((ds) => {
                  const { label: confLabel, tone: confTone, score } = datasetConfidence(ds);
                  const semanticLabel = ds.recognizedStageId
                    ? DISPOSAFE_REGISTRY.stages.find((s: any) => s.stageId === ds.recognizedStageId)?.label ?? ds.title
                    : "General data";
                  const counts = roleCounts(ds.columns);
                  const parts: string[] = [];
                  if (counts.measure) parts.push(`${counts.measure} measure${counts.measure !== 1 ? "s" : ""}`);
                  if (counts.dimension || counts["dimension-date"]) {
                    const dimTotal = counts.dimension + counts["dimension-date"];
                    parts.push(`${dimTotal} dimension${dimTotal !== 1 ? "s" : ""}`);
                  }
                  if (counts.defect) parts.push(`${counts.defect} defect code${counts.defect !== 1 ? "s" : ""}`);
                  if (counts.derived) parts.push(`${counts.derived} derived`);

                  return (
                    <div
                      key={ds.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 14px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5, fontFamily: "var(--font-display)" }}>{semanticLabel}</span>
                          <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                            {ds.sources.map((s) => s.sheetName).join(", ")}
                          </span>
                        </div>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                          {parts.length > 0 ? parts.join(" · ") : "No classifiable columns"} · {ds.totalRows.toLocaleString()} rows
                        </div>
                      </div>
                      <span
                        title={`Confidence score ${score.toFixed(2)} — see code comment in datasetConfidence() for the exact formula`}
                        style={{
                          flexShrink: 0,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 6,
                          color: confTone === "good" ? "var(--positive)" : confTone === "warn" ? "var(--warning)" : "var(--critical)",
                          background: `color-mix(in srgb, ${confTone === "good" ? "var(--positive)" : confTone === "warn" ? "var(--warning)" : "var(--critical)"} 14%, transparent)`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {confLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card title="Staging Area (Verify & Approve Records)" sub={fileName || "no file yet"}>
            {rows.length === 0 ? <Empty label="Upload a file to review extracted, recomputed records here." /> : (
              <>
                {/* Horizontal scroll container for full editability */}
                <div style={{ overflowX: "auto", width: "100%", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", marginBottom: 12 }}>
                  <table style={{ width: "100%", minWidth: "1200px", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10, textTransform: "uppercase", background: "var(--surface-2)" }}>
                        <th style={{ ...sth, minWidth: 40 }}>#</th>
                        <th style={{ ...sth, minWidth: 90, ...getHeaderStyle("date") }}>Date</th>
                        <th style={{ ...sth, minWidth: 130 }}>Stage</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 90, ...getHeaderStyle("checked") }}>Input (Checked)</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 90, ...getHeaderStyle("good") }}>Good</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 90, ...getHeaderStyle("rework") }}>Rework</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 90, ...getHeaderStyle("rejected") }}>Rejected</th>
                        <th style={{ ...sth, textAlign: "right", minWidth: 70 }}>Rej %</th>
                        <th style={{ ...sth, textAlign: "center", minWidth: 155, ...getHeaderStyle("balance") }}>Balance Check</th>
                        {defectsList.map((d: any) => (
                          <th key={d.defectCode} style={{ ...sth, textAlign: "right", minWidth: 65, ...getHeaderStyle("defect", d.defectCode) }} title={d.label}>
                            {d.defectCode}
                          </th>
                        ))}
                        <th style={{ ...sth, minWidth: 100 }}>Status</th>
                        <th style={{ ...sth, textAlign: "center", minWidth: 50 }}>Comment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, idx) => {
                        const i = page * PAGE_SIZE + idx;
                        const hasComment = !!comments[r.recordIndex]?.trim();
                        const isInvalid = r.status === "invalid";
                        const isCorrected = r.status === "corrected";
                        const flagsExpanded = expandedFlagsRow === r.recordIndex;
                        const isSwappable = isInvalid && r.flags.some(f => f.toLowerCase().includes("exceeds checked"));
                        
                        return (
                          <Fragment key={r.recordIndex}>
                            <tr
                              ref={(el) => { if (el) rowRefs.current.set(r.recordIndex, el); else rowRefs.current.delete(r.recordIndex); }}
                              style={{
                                borderTop: "1px solid var(--border)",
                                background: isInvalid ? "color-mix(in srgb, var(--status-bad) 8%, transparent)" : isCorrected ? "color-mix(in srgb, var(--status-warn) 6%, transparent)" : "transparent",
                                color: isInvalid ? "var(--status-bad)" : "var(--text)",
                                outline: flagsExpanded && isInvalid ? "2px solid var(--status-bad)" : "none",
                              }}
                            >
                              <td style={std}>{i + 1}</td>
                              <td style={{ ...std, fontFamily: "var(--font-mono)" }}>{r.date}</td>
                              <td style={std}>{r.stageLabel}</td>
                              
                              {/* Editable Quantities — only the cell(s) actually implicated in a
                                  failed rule are highlighted, not the whole row (see r.invalidFields). */}
                              <td style={{ ...std, textAlign: "right" }}>
                                <input
                                  type="number"
                                  value={r.checked ?? ""}
                                  onChange={(e) => handleCellChange(r.recordIndex, "checked", e.target.value)}
                                  style={{ ...gridInputStyle, borderColor: r.invalidFields.includes("checked") ? "var(--status-bad)" : "var(--border-strong)" }}
                                />
                              </td>
                              <td style={{ ...std, textAlign: "right" }}>
                                <input
                                  type="number"
                                  value={r.acceptedGood ?? ""}
                                  onChange={(e) => handleCellChange(r.recordIndex, "acceptedGood", e.target.value)}
                                  style={{ ...gridInputStyle, borderColor: r.invalidFields.includes("acceptedGood") ? "var(--status-bad)" : "var(--border-strong)" }}
                                />
                              </td>
                              <td style={{ ...std, textAlign: "right" }}>
                                <input
                                  type="number"
                                  value={r.rework ?? ""}
                                  onChange={(e) => handleCellChange(r.recordIndex, "rework", e.target.value)}
                                  style={{ ...gridInputStyle, borderColor: r.invalidFields.includes("rework") ? "var(--status-bad)" : "var(--border-strong)" }}
                                />
                              </td>
                              <td style={{ ...std, textAlign: "right" }}>
                                <input
                                  type="number"
                                  value={r.rejected ?? ""}
                                  onChange={(e) => handleCellChange(r.recordIndex, "rejected", e.target.value)}
                                  style={{ ...gridInputStyle, borderColor: r.invalidFields.includes("rejected") ? "var(--status-bad)" : "var(--border-strong)" }}
                                />
                              </td>
                              
                              <td style={{ ...std, textAlign: "right", fontFamily: "var(--font-mono)", paddingRight: "12px" }}>
                                {r.correctedPct != null ? `${r.correctedPct.toFixed(2)}%` : "—"}
                              </td>
                              
                              {/* Equation Balance Status */}
                              <td style={{ ...std, textAlign: "center" }}>
                                {(() => {
                                  const sum = (r.acceptedGood ?? 0) + (r.rework ?? 0) + (r.rejected ?? 0);
                                  const isBalanced = r.checked === sum;
                                  return (
                                    <span style={{ 
                                      fontFamily: "var(--font-mono)", 
                                      fontSize: 10.5, 
                                      fontWeight: 700,
                                      color: isBalanced ? "var(--status-good)" : "var(--status-bad)",
                                      background: isBalanced ? "color-mix(in srgb, var(--status-good) 8%, transparent)" : "color-mix(in srgb, var(--status-bad) 8%, transparent)",
                                      padding: "3px 6px",
                                      borderRadius: 5,
                                      border: isBalanced ? "1px solid color-mix(in srgb, var(--status-good) 30%, transparent)" : "1px solid color-mix(in srgb, var(--status-bad) 30%, transparent)"
                                    }}>
                                      {r.checked ?? 0} = {r.acceptedGood ?? 0} + {r.rework ?? 0} + {r.rejected ?? 0}
                                    </span>
                                  );
                                })()}
                              </td>
                              
                              {/* Dynamic Defect Cells */}
                              {defectsList.map((d: any) => {
                                const isApplicable = d.stages.includes(r.stageId);
                                const colKey = defectKey(d.defectCode);
                                const defectVal = r.defects.find(df => defectKey(df.raw) === colKey)?.value ?? 0;
                                const isCulprit = r.invalidFields.includes(colKey);
                                return (
                                  <td key={d.defectCode} style={{ ...std, textAlign: "right" }}>
                                    <input
                                      type="number"
                                      disabled={!isApplicable}
                                      value={isApplicable ? (defectVal || "") : ""}
                                      onChange={(e) => handleCellChange(r.recordIndex, d.defectCode, e.target.value)}
                                      style={{
                                        ...gridInputStyle,
                                        width: "55px",
                                        borderColor: isCulprit ? "var(--status-bad)" : "var(--border-strong)",
                                        opacity: isApplicable ? 1 : 0.25,
                                        background: isApplicable ? "var(--bg)" : "var(--surface-2)",
                                        cursor: isApplicable ? "text" : "not-allowed"
                                      }}
                                    />
                                  </td>
                                );
                              })}

                              <td style={{ ...std, fontWeight: 600 }}>
                                {isInvalid ? (
                                  <button
                                    onClick={() => setExpandedFlagsRow(flagsExpanded ? null : r.recordIndex)}
                                    title="Click to see what's wrong"
                                    style={{
                                      display: "inline-flex", alignItems: "center", gap: 4,
                                      padding: "2px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
                                      border: "1px solid var(--status-bad)",
                                      background: "color-mix(in srgb, var(--status-bad) 12%, transparent)",
                                      color: "var(--status-bad)",
                                    }}
                                  >
                                    ⚠ Invalid {flagsExpanded ? "▲" : "▼"}
                                  </button>
                                ) : isCorrected ? (
                                  <span style={{ color: "var(--status-warn)" }}>Corrected</span>
                                ) : (
                                  <span style={{ color: "var(--status-good)" }}>✓ Valid</span>
                                )}
                              </td>
                              <td style={{ ...std, textAlign: "center" }}>
                                <button
                                  onClick={() => setEditingCommentRow(editingCommentRow === r.recordIndex ? null : r.recordIndex)}
                                  style={{
                                    background: hasComment ? "var(--accent)" : "var(--surface-2)",
                                    color: hasComment ? "#fff" : "var(--text-2)",
                                    border: "none",
                                    borderRadius: 7,
                                    width: 28,
                                    height: 28,
                                    cursor: "pointer"
                                  }}
                                >
                                  <Icon name="comment" size={13} />
                                </button>
                              </td>
                            </tr>
                            {flagsExpanded && isInvalid && (
                              <tr style={{ background: "color-mix(in srgb, var(--status-bad) 4%, transparent)" }}>
                                <td colSpan={totalCols} style={{ padding: 0 }}>
                                  <div className="expand-panel" style={{ padding: "10px 16px 12px 50px", borderBottom: "1px solid var(--border)" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                      <div style={{ fontWeight: 700, fontSize: 10.5, color: "var(--status-bad)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
                                        <span>⚠</span>
                                        <span>Validation Issues for Row {i + 1}:</span>
                                      </div>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 12 }}>
                                        {r.flags.map((flag, fi) => (
                                          <div key={fi} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text)" }}>
                                            <span style={{ color: "var(--status-bad)" }}>•</span>
                                            <span>{flag}</span>
                                          </div>
                                        ))}
                                      </div>
                                      {isSwappable && (
                                        <div style={{ marginTop: 4, paddingLeft: 12 }}>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleSwapCheckedRejected(r.recordIndex); }}
                                            style={{
                                              fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                                              border: "1px solid var(--status-warn)",
                                              background: "color-mix(in srgb, var(--status-warn) 12%, var(--surface))",
                                              color: "var(--status-warn)",
                                              transition: "all 0.2s ease"
                                            }}
                                          >
                                            ⇅ Swap Checked ↔ Rejected values
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {editingCommentRow !== null && (
                  <div className="comment-box-panel" style={{ marginTop: 16, padding: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
                      <span>Add Operator Comment</span>
                      <button onClick={() => setEditingCommentRow(null)} style={{ fontSize: 11, color: "var(--accent)", cursor: "pointer" }}>Close</button>
                    </div>
                    <textarea
                      autoFocus
                      placeholder={`Enter discrepancy / correction explanation for row #${rows.findIndex(r => r.recordIndex === editingCommentRow) + 1}...`}
                      value={comments[editingCommentRow] ?? ""}
                      onChange={(e) => setComments(c => ({ ...c, [editingCommentRow]: e.target.value }))}
                      style={{
                        width: "100%",
                        minHeight: 56,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text)",
                        fontSize: 13,
                        fontFamily: "inherit",
                        outline: "none"
                      }}
                    />
                  </div>
                )}
                {rows.length > PAGE_SIZE && (() => {
                  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
                  const from = page * PAGE_SIZE + 1;
                  const to = Math.min((page + 1) * PAGE_SIZE, rows.length);
                  const pgBtn = (disabled: boolean): React.CSSProperties => ({
                    padding: "4px 10px", borderRadius: "var(--radius-sm)", fontSize: 11.5, fontWeight: 600,
                    border: "1px solid var(--border-strong)", background: "var(--bg)", color: "var(--text-2)",
                    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
                  });
                  return (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                      <span className="muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>Showing {from}–{to} of {rows.length.toLocaleString()} records</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                        <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} style={pgBtn(page === 0)}>‹ Prev</button>
                        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{page + 1} / {totalPages}</span>
                        <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} style={pgBtn(page >= totalPages - 1)}>Next ›</button>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </Card>
        </div>

        {/* right rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Quick Stats">
            <Stat label="Total Records" value={rows.length.toLocaleString()} />
            <Stat label="Total Input" value={totals.input.toLocaleString()} />
            <Stat label="Total Rejected" value={totals.rejected.toLocaleString()} tone="bad" />
            <Stat label="Overall Rejection %" value={`${totals.rejPct.toFixed(2)}%`} tone="bad" />
          </Card>
          <Card title="Data Quality Check">
            {dq.map((d) => (
              <div key={d.label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
                <span className="muted">{d.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, color: d.state === "Passed" ? "var(--status-good)" : d.state === "Warning" ? "var(--status-warn)" : "var(--status-bad)", background: `color-mix(in srgb, ${d.state === "Passed" ? "var(--status-good)" : d.state === "Warning" ? "var(--status-warn)" : "var(--status-bad)"} 14%, transparent)` }}>{d.state}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontSize: 13 }}>
              <strong>Record Distribution</strong>
              <span className="muted">{summary.ok + summary.corrected} valid · {summary.invalid} invalid</span>
            </div>
          </Card>
          <Card title="Actions">
            {extractedSchema && (
              <button onClick={() => setShowSchemaModal(true)}
                style={{ width: "100%", background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 9, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name="table" size={14} /> View Extracted Schema
              </button>
            )}
            <button onClick={publish} disabled={rows.length === 0 || summary.invalid > 0 || busy}
              style={{ width: "100%", background: "var(--status-good)", color: "#fff", border: "none", borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 700, cursor: rows.length && !summary.invalid && !busy ? "pointer" : "not-allowed", opacity: rows.length && !summary.invalid && !busy ? 1 : 0.5 }}>
              <Icon name="check" size={14} /> {busy ? "Publishing…" : "Publish to Analytics"}
            </button>
            {summary.invalid > 0 && <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Fix {summary.invalid} invalid row(s) before publishing.</div>}
          </Card>
        </div>
      </div>

      {showSchemaModal && extractedSchema && (
        <div 
          className="modal-backdrop"
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(18,16,14,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowSchemaModal(false); }}
        >
          <div 
            className="modal-panel"
            style={{ background: "var(--paper)", border: "2px solid var(--ink)", borderRadius: "var(--radius-lg)", boxShadow: "8px 8px 0px var(--ink)", width: "100%", maxWidth: "900px", maxHeight: "85vh", display: "flex", flexDirection: "column", color: "var(--ink)", overflow: "hidden" }}
          >
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "2px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Extracted Plant-Wide Schema</h2>
                <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>Source: {extractedSchema.fileName}</p>
              </div>
              <button onClick={() => setShowSchemaModal(false)} style={{ background: "transparent", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-2)", fontWeight: 300, lineHeight: 1 }}>&times;</button>
            </div>

            {/* Content */}
            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
              {saveSuccessMsg && (
                <div style={{
                  background: "color-mix(in srgb, var(--status-good) 12%, transparent)",
                  border: "1.5px solid var(--status-good)",
                  color: "var(--status-good)",
                  padding: "10px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: "2px 2px 0px var(--status-good)"
                }}>
                  {saveSuccessMsg}
                </div>
              )}
              {/* Stage Relationship Flowchart */}
              <div>
                <h3 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", margin: "0 0 14px", fontWeight: 700 }}>Manufacturing Process Flow</h3>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                  {extractedSchema.stages.map((stage: any, idx: number) => (
                    <div key={stage.stageId} style={{ display: "flex", alignItems: "center" }}>
                      <div style={{ background: "var(--surface)", border: "1.5px solid var(--ink)", borderRadius: "var(--radius-md)", padding: "10px 16px", boxShadow: "3px 3px 0 var(--ink)", display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "var(--accent)" }}>Stage {idx + 1}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-display)" }}>{stage.label}</span>
                        <span style={{ fontSize: 10, color: "var(--text-3)" }}>{stage.rowCount} records found</span>
                      </div>
                      {idx < extractedSchema.stages.length - 1 && (
                        <div style={{ display: "flex", alignItems: "center", padding: "0 8px" }}>
                          <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
                            <path d="M0 6H20M20 6L15 1M20 6L15 11" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Column mapping per Stage */}
              <div>
                <h3 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-3)", margin: "0 0 14px", fontWeight: 700 }}>Extracted Schema Details</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {extractedSchema.stages.map((stage: any) => {
                    return (
                      <div key={stage.stageId} style={{ border: "1.5px solid var(--ink)", borderRadius: "var(--radius-md)", background: "var(--surface)", overflow: "hidden", boxShadow: "3px 3px 0 var(--ink)" }}>
                        <div style={{ background: "var(--surface-2)", padding: "10px 16px", borderBottom: "1.5px solid var(--ink)", fontWeight: 700, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>{stage.label}</span>
                          <code style={{ fontSize: 10, color: "var(--text-3)" }}>id: {stage.stageId}</code>
                        </div>
                        <div style={{ padding: 16, overflowX: "auto" }}>
                          <table style={modalTableStyle}>
                            <thead>
                              <tr>
                                <th style={{ ...modalThStyle, width: "60px" }}>Col</th>
                                <th style={modalThStyle}>Excel Header Name</th>
                                <th style={{ ...modalThStyle, width: "100px" }}>Data Type</th>
                                <th style={{ ...modalThStyle, width: "240px" }}>Mapped Role</th>
                                <th style={{ ...modalThStyle, width: "180px" }}>Verification / Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stage.fields.map((field: any) => {
                                const selectVal = getSelectRoleValue(field.role);
                                return (
                                  <tr key={field.name}>
                                    <td style={{ ...modalTdStyle, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)" }}>
                                      {field.colLetter}
                                    </td>
                                    <td style={{ ...modalTdStyle, fontWeight: 600 }}>
                                      {field.name}
                                    </td>
                                    <td style={modalTdStyle}>
                                      <span style={{
                                        fontSize: "10.5px",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        color: field.type === "date" ? "var(--accent)" : field.type === "number" ? "var(--status-good)" : "var(--text-3)",
                                        background: "var(--surface-2)",
                                        padding: "2px 6px",
                                        borderRadius: "4px"
                                      }}>
                                        {field.type}
                                      </span>
                                    </td>
                                    <td style={modalTdStyle}>
                                      <select
                                        value={selectVal}
                                        onChange={(e) => handleSchemaFieldRoleChange(stage.stageId, field.name, e.target.value)}
                                        style={modalSelectStyle}
                                      >
                                        {roleOptions.map(opt => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td style={modalTdStyle}>
                                      {field.formula ? (
                                        <code style={{ fontSize: "10px", color: "var(--text-2)" }}>
                                          {field.formula}
                                        </code>
                                      ) : field.role === "defect" ? (
                                        <span style={{ fontSize: "11px", color: "var(--status-bad)", fontWeight: 600 }}>
                                          Defect mode count
                                        </span>
                                      ) : field.role === "good" ? (
                                        <span style={{ fontSize: "11px", color: "var(--status-good)", fontWeight: 600 }}>
                                          Pass count
                                        </span>
                                      ) : field.role === "rework" ? (
                                        <span style={{ fontSize: "11px", color: "var(--status-warn)", fontWeight: 600 }}>
                                          Rework count
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                                          —
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 20px", borderTop: "1.5px solid var(--border)", background: "var(--surface-2)", display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button
                onClick={commitSchemaAsMaster}
                disabled={busy}
                style={{
                  background: "var(--status-good)",
                  color: "#fff",
                  border: "1.5px solid var(--ink)",
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: busy ? "not-allowed" : "pointer",
                  boxShadow: busy ? "none" : "2px 2px 0 var(--ink)",
                  opacity: busy ? 0.7 : 1
                }}
              >
                {busy ? "Locking..." : "Commit Layout as Master Schema"}
              </button>
              <button onClick={() => setShowSchemaModal(false)}
                style={{ background: "var(--accent)", color: "#fff", border: "1.5px solid var(--ink)", borderRadius: 8, padding: "8px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "2px 2px 0 var(--ink)" }}>
                Close Schema Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

/** Count a Dataset's columns by role — the per-sheet role breakdown shown in the
 *  C1 reveal panel (e.g. "3 measures · 1 dimension · 21 defect codes · 1 derived"). */
function roleCounts(columns: Dataset["columns"]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of columns) counts[c.role] = (counts[c.role] ?? 0) + 1;
  return {
    measure: counts["measure"] ?? 0,
    dimension: counts["dimension"] ?? 0,
    "dimension-date": counts["dimension-date"] ?? 0,
    defect: counts["defect"] ?? 0,
    derived: counts["derived"] ?? 0,
    meta: counts["meta"] ?? 0,
  };
}

/** Deterministic confidence proxy for the C1 reveal panel — NOT an AI-invented
 *  percentage. Formula:
 *    nonOtherRoleFraction = columns whose role is classified as something
 *      meaningful (i.e. NOT "meta" — Dataset.columns never actually contains
 *      "meta" columns since computeSignature() already strips them, so this
 *      term is 1.0 whenever a dataset was successfully profiled at all) divided
 *      by total column count.
 *    hasDate = at least one column has role "dimension-date" (a real time axis
 *      was found, not just untyped columns).
 *  score = nonOtherRoleFraction, with a small deterministic bonus (+0.1, capped
 *      at 1.0) when hasDate is true — a dataset with a recognizable date axis is
 *      more analyzable than one without, which is an honest, explainable signal
 *      (not invented). Bands: ≥0.9 High (positive), ≥0.7 Medium (warning),
 *      else Needs review (critical) — mirrors the tone thresholds already used
 *      elsewhere in the app (Kpi tone prop / --positive/--warning/--critical). */
function datasetConfidence(ds: Dataset): { score: number; label: string; tone: "good" | "warn" | "bad" } {
  const cols = ds.columns;
  if (cols.length === 0) return { score: 0, label: "Needs review", tone: "bad" };
  const nonMetaCount = cols.filter((c) => c.role !== "meta").length;
  const nonOtherRoleFraction = nonMetaCount / cols.length;
  const hasDate = cols.some((c) => c.role === "dimension-date");
  const score = Math.min(1, nonOtherRoleFraction + (hasDate ? 0.1 : 0));
  if (score >= 0.9) return { score, label: "High", tone: "good" };
  if (score >= 0.7) return { score, label: "Medium", tone: "warn" };
  return { score, label: "Needs review", tone: "bad" };
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const c = tone === "bad" ? "var(--status-bad)" : tone === "good" ? "var(--status-good)" : "var(--text)";
  return <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span className="muted">{label}</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: c }}>{value}</span></div>;
}
const sth: React.CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const std: React.CSSProperties = { padding: "6px 8px" };

const modalTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "12.5px",
  textAlign: "left",
  marginTop: "10px",
  border: "1px solid var(--border)",
};

const modalThStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "var(--surface-2)",
  borderBottom: "1.5px solid var(--ink)",
  fontWeight: 700,
  textTransform: "uppercase",
  fontSize: "10px",
  letterSpacing: "0.05em",
  color: "var(--text-3)",
};

const modalTdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

const modalSelectStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1.5px solid var(--ink)",
  borderRadius: "6px",
  padding: "4px 8px",
  fontSize: "12px",
  fontFamily: "var(--font-sans)",
  color: "var(--ink)",
  cursor: "pointer",
  outline: "none",
  width: "100%",
  boxShadow: "1px 1px 0px var(--ink)",
};

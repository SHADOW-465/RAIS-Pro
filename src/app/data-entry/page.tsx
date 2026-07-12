// src/app/data-entry/page.tsx
"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import AppShell from "@/components/app/AppShell";
import Icon from "@/components/editorial/Icon";
import { useEvents } from "@/components/app/EventsContext";
import { EMPTY_REGISTRY } from "@/core/ontology/empty-registry";
import DatasetEntryForm from "@/components/DatasetEntryForm";
import MonthlyEntryGrid from "@/components/MonthlyEntryGrid";
import { useTweaks } from "@/components/editorial/TweaksContext";
import WeekPicker from "@/components/WeekPicker";
import { type EntryGrain } from "@/lib/entry/period";
import { fyContaining } from "@/lib/analytics/scope";

const today = () => new Date().toISOString().slice(0, 10);

export default function DataEntryPage() {
  const { refreshEvents, events } = useEvents();
  const [activeTab, setActiveTab] = useState<"entry" | "ledger" | "custom">("entry");
  const [monthlyDirty, setMonthlyDirty] = useState(false);
  const [date, setDate] = useState(today());

  const { t, setTweak } = useTweaks();

  // FY grain doesn't have its own row range — it narrows to a fiscal year,
  // then a month tab within it drives the same Month case the grid already
  // renders. `fyOpenMonth` is the anchor actually passed to the grid whenever
  // t.grain === "fy"; `date` (below) remains the anchor for day/week/month.
  const [fyStartYear, setFyStartYear] = useState<number>(() => fyContaining(today()).startYear);
  const [fyOpenMonth, setFyOpenMonth] = useState<string>(() => {
    const fy = fyContaining(today());
    return fy.from; // default to April 1st of the current/most-recent FY
  });

  // Grain-change guard: the topbar's D/W/M/FY buttons (AppShell) set t.grain
  // directly with no way for this page to veto it. Detect the change here
  // instead, and revert it if there are unsaved edits the operator declines
  // to discard — see docs/superpowers/specs/2026-07-09-data-entry-grain-aware-design.md §4.
  const prevGrainRef = useRef(t.grain);
  useEffect(() => {
    if (t.grain === prevGrainRef.current) return;
    if (activeTab === "entry" && monthlyDirty) {
      const ok = confirm("You have unsaved changes in the data entry grid that haven't been submitted yet. Switching the Grain will discard them. Continue?");
      if (!ok) {
        setTweak("grain", prevGrainRef.current);
        return;
      }
    }
    prevGrainRef.current = t.grain;
  }, [t.grain, activeTab, monthlyDirty, setTweak]);

  // The FY dropdown's options: every FY that has at least one event, plus the
  // FY containing today so the control is never empty on a fresh install.
  const fyOptions = useMemo(() => {
    const years = new Set<number>([fyContaining(today()).startYear]);
    for (const e of events ?? []) {
      years.add(fyContaining(e.occurredOn.start).startYear);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [events]);

  // The grain actually handed to MonthlyEntryGrid: "fy" isn't a grid grain
  // (Task 2's EntryGrain is day|week|month) — FY mode always edits a month.
  const effectiveGrain: EntryGrain = t.grain === "fy" ? "month" : t.grain;
  const effectiveAnchor = t.grain === "fy" ? fyOpenMonth : date;

  const [hdr, setHdr] = useState({
    shift: "Day Shift",
    operator: "",
    supervisor: "",
    product: "FBC",
    size: "All",
    machine: "All Machines",
    batch: ""
  });

  const [notes, setNotes] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  // Registry state
  const [registry, setRegistry] = useState<any | null>(null);
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  // Ledger state
  const [ledgerRecords, setLedgerRecords] = useState<any[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerSort, setLedgerSort] = useState<{ col: string; desc: boolean }>({ col: "date", desc: true });

  // Load registry, ledger records, and prefilled header fields on mount.
  // The spreadsheet itself (MonthlyEntryGrid) loads its own month of data.
  useEffect(() => {
    loadRegistry(null);
    loadLedger();
    if (typeof window !== "undefined") {
      const savedOperator = localStorage.getItem("rais_hdr_operator");
      const savedSupervisor = localStorage.getItem("rais_hdr_supervisor");
      const savedMachine = localStorage.getItem("rais_hdr_machine");
      const savedProduct = localStorage.getItem("rais_hdr_product");
      const savedSize = localStorage.getItem("rais_hdr_size");
      const savedBatch = localStorage.getItem("rais_hdr_batch");
      const savedShift = localStorage.getItem("rais_hdr_shift");

      setHdr((prev) => ({
        shift: savedShift !== null ? savedShift : prev.shift,
        operator: savedOperator !== null ? savedOperator : prev.operator,
        supervisor: savedSupervisor !== null ? savedSupervisor : prev.supervisor,
        machine: savedMachine !== null ? savedMachine : prev.machine,
        product: savedProduct !== null ? savedProduct : prev.product,
        size: savedSize !== null ? savedSize : prev.size,
        batch: savedBatch !== null ? savedBatch : prev.batch
      }));
    }
  }, []);

  const updateHdrField = (field: keyof typeof hdr, val: string) => {
    setHdr((prev) => {
      const next = { ...prev, [field]: val };
      if (typeof window !== "undefined") {
        localStorage.setItem(`rais_hdr_${field}`, val);
      }
      return next;
    });
  };

  const loadRegistry = async (presetId?: string | null) => {
    setLoadingRegistry(true);
    try {
      const res = await fetch(presetId ? `/api/schema?presetId=${encodeURIComponent(presetId)}` : "/api/schema");
      const data = await res.json();
      if (data.registry) {
        setRegistry(data.registry);
      }
    } catch (err) {
      console.error("Error loading registry:", err);
    } finally {
      setLoadingRegistry(false);
    }
  };

  const loadLedger = async () => {
    try {
      const res = await fetch("/api/manual-entries");
      const data = await res.json();
      if (data.records) {
        setLedgerRecords(data.records);
      }
    } catch (err) {
      console.error("Error loading ledger:", err);
    }
  };

  // Guards every action that would unmount/remount MonthlyEntryGrid (Report
  // Date change, ledger Edit/Duplicate, switching to another tab) while it
  // has unsaved edits — otherwise they'd vanish with no warning.
  const confirmLeaveEntryGrid = (): boolean => {
    if (activeTab !== "entry" || !monthlyDirty) return true;
    return confirm("You have unsaved changes in the data entry grid that haven't been submitted yet. Continuing will discard them. Continue?");
  };

  const activeRegistry = useMemo(() => {
    return registry || EMPTY_REGISTRY;
  }, [registry]);

  // customFields merged onto every record MonthlyEntryGrid saves — the same
  // header tags the old single-day grid attached. `size` is used only as a
  // fallback for rows whose own registry size is null (line-only stages);
  // MonthlyEntryGrid prefers the row's real size when the stage is size-wise.
  const entryCustomFields = useMemo(
    () => ({
      operator: hdr.operator, supervisor: hdr.supervisor, machine: hdr.machine,
      product: hdr.product, size: hdr.size, batch: hdr.batch, shift: hdr.shift, notes,
    }),
    [hdr, notes],
  );

  // Ledger Actions — Edit/Duplicate jump the entry grid to the relevant date;
  // MonthlyEntryGrid is remounted via `key={date}` below, so it reloads
  // fresh whenever `date` changes. Delete removes the underlying event-store
  // record directly and is unrelated to the grid.
  const handleEditLedgerRecord = (rec: any) => {
    setHdr({
      shift: rec.shift, operator: rec.operator, supervisor: rec.supervisor,
      product: rec.product, size: rec.size, machine: rec.machine, batch: rec.batch,
    });
    setNotes(rec.notes || "");
    setActiveTab("entry");
    setDate(rec.date);
    setSuccess(`Record loaded for editing. Editing date: ${rec.date}.`);
  };

  // ponytail: duplicates header fields onto today's date only — does not
  // copy the source day's quantities forward (MonthlyEntryGrid has no
  // external-seed hook for that). Add a seedRecords prop to MonthlyEntryGrid
  // if operators rely on copying values, not just headers, between days.
  const handleDuplicateLedgerRecord = (rec: any) => {
    setHdr({
      shift: rec.shift, operator: rec.operator, supervisor: rec.supervisor,
      product: rec.product, size: rec.size, machine: rec.machine, batch: rec.batch,
    });
    setNotes(rec.notes || "");
    setActiveTab("entry");
    setDate(today());
    setSuccess("Header fields duplicated onto today's date. Enter today's quantities and Save Month.");
  };

  const handleDeleteLedgerRecord = async (rec: any) => {
    const isDirect = rec.source === "Direct Entry";
    const recordType = isDirect ? "manual entry record" : `uploaded record (${rec.source})`;
    if (!confirm(`Are you sure you want to delete the ${recordType} for ${rec.date} (${rec.shift})?`)) return;
    try {
      const res = await fetch(`/api/manual-entries?date=${rec.date}&shift=${rec.shift}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete record");

      setSuccess(`Record for ${rec.date} (${rec.shift}) has been deleted successfully.`);
      loadLedger();
      refreshEvents().catch(console.error);
    } catch (e: any) {
      alert("Error deleting: " + e.message);
    }
  };

  // Sort and filter ledger records
  const filteredLedger = useMemo(() => {
    return ledgerRecords
      .filter((rec) => {
        const query = ledgerSearch.toLowerCase().trim();
        if (!query) return true;
        return (
          rec.date.includes(query) ||
          rec.shift.toLowerCase().includes(query) ||
          (rec.source || "").toLowerCase().includes(query) ||
          rec.operator.toLowerCase().includes(query) ||
          rec.supervisor.toLowerCase().includes(query) ||
          rec.machine.toLowerCase().includes(query) ||
          rec.product.toLowerCase().includes(query) ||
          rec.size.toLowerCase().includes(query) ||
          rec.batch.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const field = ledgerSort.col;
        const desc = ledgerSort.desc;
        let av = a[field] ?? "";
        let bv = b[field] ?? "";

        if (field === "date" || field === "recordedAt") {
          return desc ? bv.localeCompare(av) : av.localeCompare(bv);
        }

        av = typeof av === "string" ? av.toLowerCase() : av;
        bv = typeof bv === "string" ? bv.toLowerCase() : bv;

        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
        return 0;
      });
  }, [ledgerRecords, ledgerSearch, ledgerSort]);

  const toggleSort = (col: string) => {
    setLedgerSort((prev) => ({
      col,
      desc: prev.col === col ? !prev.desc : true
    }));
  };

  return (
    <AppShell active="data-entry">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => { if (confirmLeaveEntryGrid()) setActiveTab("entry"); }}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "8px 0 0 8px",
              background: activeTab === "entry" ? "var(--accent)" : "var(--surface-2)",
              color: activeTab === "entry" ? "var(--text-invert)" : "var(--text-2)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            New Data Entry
          </button>
          <button
            onClick={() => { if (confirmLeaveEntryGrid()) { setActiveTab("ledger"); loadLedger(); } }}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "0",
              background: activeTab === "ledger" ? "var(--accent)" : "var(--surface-2)",
              color: activeTab === "ledger" ? "var(--text-invert)" : "var(--text-2)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Entry History / Data Ledger
          </button>
          <button
            onClick={() => { if (confirmLeaveEntryGrid()) setActiveTab("custom"); }}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "0 8px 8px 0",
              background: activeTab === "custom" ? "var(--accent)" : "var(--surface-2)",
              color: activeTab === "custom" ? "var(--text-invert)" : "var(--text-2)",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Custom Datasets
          </button>
        </div>

        
      </div>

      {success && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 9, background: "var(--positive-weak)", border: "1px solid var(--positive)", color: "var(--positive)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "var(--positive)", fontWeight: 700 }}>&times;</button>
        </div>
      )}

      {activeTab === "custom" ? (
        <DatasetEntryForm />
      ) : activeTab === "entry" ? (
        loadingRegistry ? (
          <div className="muted" style={{ padding: 48, textAlign: "center" }}>Loading schema registry…</div>
        ) : !registry || !registry.stages || registry.stages.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", background: "var(--surface)", border: "1px dashed var(--border)", borderRadius: 12, color: "var(--text-2)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "var(--text)" }}>No Active Schema for Data Entry</h3>
            <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
              There is currently no schema configured for manual data entry. You need to upload a workbook to establish a schema registry.
            </p>
            <a href="/staging" style={{ display: "inline-block", padding: "8px 16px", borderRadius: 6, background: "var(--accent)", color: "var(--text-invert)", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              Go to Excel Upload / Staging
            </a>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 16, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <label className="muted" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
                {t.grain === "day" && "Report Date"}
                {t.grain === "week" && "Report Week"}
                {t.grain === "month" && "Report Month"}
                {t.grain === "fy" && "Report FY"}

                {t.grain === "day" && (
                  <input type="date" value={date} onChange={(e) => {
                    const newDate = e.target.value;
                    if (!confirmLeaveEntryGrid()) return;
                    setDate(newDate);
                  }} style={{ ...inp, width: 160 }} />
                )}

                {t.grain === "week" && (
                  <WeekPicker value={date} onChange={(next) => {
                    if (!confirmLeaveEntryGrid()) return;
                    setDate(next);
                  }} />
                )}

                {t.grain === "month" && (
                  <input type="month" value={date.slice(0, 7)} onChange={(e) => {
                    if (!confirmLeaveEntryGrid()) return;
                    setDate(`${e.target.value}-01`);
                  }} style={{ ...inp, width: 160 }} />
                )}

                {t.grain === "fy" && (
                  <select value={fyStartYear} onChange={(e) => {
                    if (!confirmLeaveEntryGrid()) return;
                    const y = Number(e.target.value);
                    setFyStartYear(y);
                    setFyOpenMonth(`${y}-04-01`);
                  }} style={{ ...inp, width: 160 }}>
                    {fyOptions.map((y) => (
                      <option key={y} value={y}>FY{y}-{String((y + 1) % 100).padStart(2, "0")}</option>
                    ))}
                  </select>
                )}
              </label>
              
              <label className="muted" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
                Shift
                <select value={hdr.shift} onChange={(e) => updateHdrField("shift", e.target.value)} style={{ ...inp, width: 140 }}>
                  <option>Day Shift</option>
                  <option>Night Shift</option>
                </select>
              </label>
            </div>

            <Section title="Operator & Batch Information">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <Field label="Operator *">
                  <input style={inp} value={hdr.operator} onChange={(e) => updateHdrField("operator", e.target.value)} placeholder="Required" />
                </Field>
                <Field label="Supervisor">
                  <input style={inp} value={hdr.supervisor} onChange={(e) => updateHdrField("supervisor", e.target.value)} placeholder="Supervisor name" />
                </Field>
                <Field label="Product">
                  <input style={inp} value={hdr.product} onChange={(e) => updateHdrField("product", e.target.value)} />
                </Field>
                <Field label="Size (French)">
                  <input style={inp} value={hdr.size} onChange={(e) => updateHdrField("size", e.target.value)} />
                </Field>
                <Field label="Machine">
                  <input style={inp} value={hdr.machine} onChange={(e) => updateHdrField("machine", e.target.value)} />
                </Field>
                <Field label="Batch / Lot No.">
                  <input style={inp} value={hdr.batch} onChange={(e) => updateHdrField("batch", e.target.value)} placeholder="e.g. LOT-123" />
                </Field>
              </div>
            </Section>

            <Section title="Additional Notes / Remarks">
              <Field label="Remarks">
                <textarea
                  style={{ ...inp, minHeight: 60, fontFamily: "inherit" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="General shift report remarks or notes..."
                />
              </Field>
            </Section>

            {t.grain === "fy" && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
                {Array.from({ length: 12 }, (_, i) => {
                  const month = ((i + 3) % 12) + 1; // Apr(4)..Mar(3): i=0 -> 4, ..., i=8 -> 12, i=9 -> 1, ...
                  const year = month >= 4 ? fyStartYear : fyStartYear + 1;
                  const anchor = `${year}-${String(month).padStart(2, "0")}-01`;
                  const on = fyOpenMonth.slice(0, 7) === anchor.slice(0, 7);
                  const label = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month - 1];
                  return (
                    <button key={anchor} onClick={() => { if (confirmLeaveEntryGrid()) setFyOpenMonth(anchor); }}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-strong)",
                        background: on ? "var(--accent)" : "var(--surface-2)",
                        color: on ? "var(--text-invert)" : "var(--text-2)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            <MonthlyEntryGrid
              key={`${effectiveGrain}-${effectiveAnchor}`}
              grain={effectiveGrain}
              anchorDate={effectiveAnchor}
              onAnchorChange={(next) => {
                if (t.grain === "fy") {
                  setFyOpenMonth(next);
                  setFyStartYear(fyContaining(next).startYear);
                } else {
                  setDate(next);
                }
              }}
              presetId={null}
              customFields={entryCustomFields}
              blockedReason={hdr.operator.trim() ? null : "Operator name is required."}
              onDirtyChange={setMonthlyDirty}
            />
          </div>
        )
      ) : (
        /* Data Ledger / Entry History View */
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, margin: 0 }}>Data Entry & Ingest Ledger</h2>
            <div style={{ position: "relative", width: 300 }}>
              <input
                type="text"
                placeholder="Search ledger..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                style={{ ...inp, paddingRight: 32 }}
              />
              <span style={{ position: "absolute", right: 10, top: 8, color: "var(--text-3)" }}>🔍</span>
            </div>
          </div>

          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: "1.5px solid var(--border-strong)" }}>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("date")}>Date {ledgerSort.col === "date" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("shift")}>Shift/Sheet {ledgerSort.col === "shift" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("source")}>Source {ledgerSort.col === "source" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("operator")}>Operator {ledgerSort.col === "operator" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("machine")}>Machine {ledgerSort.col === "machine" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("product")}>Product {ledgerSort.col === "product" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={th}>Checked</th>
                <th style={th}>Rejected</th>
                <th style={th}>Rej %</th>
                <th style={{ ...th, cursor: "pointer" }} onClick={() => toggleSort("recordedAt")}>Last Saved/Edited {ledgerSort.col === "recordedAt" ? (ledgerSort.desc ? "▼" : "▲") : ""}</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ ...td, textAlign: "center", padding: 24, color: "var(--text-3)" }}>
                    No manual or uploaded entry records found matching search.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((rec, idx) => {
                  // Compute totals for ledger row
                  let chk = 0;
                  let rej = 0;
                  Object.values(rec.stageData).forEach((sData: any) => {
                    chk += Number(sData["Checked Qty"]) || 0;
                    rej += Number(sData["Rejected Qty"]) || 0;
                  });
                  const rate = chk ? (rej / chk) * 100 : 0;

                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "transparent" : "var(--surface-2)" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{rec.date}</td>
                      <td style={td}>{rec.shift}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: 11,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: rec.source === "Direct Entry" ? "var(--accent-weak)" : "var(--surface-3)",
                          color: rec.source === "Direct Entry" ? "var(--accent-text)" : "var(--text-2)",
                          fontWeight: 600
                        }}>
                          {rec.source}
                        </span>
                      </td>
                      <td style={td}>{rec.operator}</td>
                      <td style={td}>{rec.machine}</td>
                      <td style={td}>{rec.product} ({rec.size})</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{chk.toLocaleString()}</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--status-bad)" }}>{rej.toLocaleString()}</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono)", color: rate > 10 ? "var(--status-bad)" : "inherit" }}>{rate.toFixed(2)}%</td>
                      <td style={td}>
                        {rec.recordedAt ? new Date(rec.recordedAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        }) : "—"}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 8 }}>
                          <button
                            onClick={() => handleEditLedgerRecord(rec)}
                            style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDuplicateLedgerRecord(rec)}
                            style={{ background: "transparent", border: "none", color: "var(--status-good)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={() => handleDeleteLedgerRecord(rec)}
                            style={{ background: "transparent", border: "none", color: "var(--status-bad)", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

    </AppShell>
  );
}

/* ── UI Bits ───────────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)", padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

/* Styles */
const inp: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none"
};

const ghost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: 9,
  padding: "10px 22px",
  fontSize: 14,
  cursor: "pointer"
};

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontWeight: 600,
  borderBottom: "1px solid var(--border)"
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  color: "var(--text-2)"
};

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: "var(--radius-md)",
  padding: "10px 24px",
  fontSize: "13.5px",
  fontWeight: 700,
  cursor: "pointer"
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  padding: "10px 24px",
  fontSize: "13.5px",
  fontWeight: 600,
  cursor: "pointer"
};

const btnSmallPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "var(--text-invert)",
  border: "none",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer"
};

const btnSmallGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer"
};

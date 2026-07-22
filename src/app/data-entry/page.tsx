// src/app/data-entry/page.tsx
"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import AppShell from "@/components/app/AppShell";
import { useEvents } from "@/components/app/EventsContext";
import MonthlyEntryGrid from "@/components/MonthlyEntryGrid";
import BatchMatrixEntry from "@/components/BatchMatrixEntry";
import { useTweaks } from "@/components/editorial/TweaksContext";
import WeekPicker from "@/components/WeekPicker";
import { type EntryGrain } from "@/lib/entry/period";
import { fyContaining } from "@/lib/analytics/scope";

const today = () => new Date().toISOString().slice(0, 10);

type EntryMode = "matrix" | "period" | "ledger";

export default function DataEntryPage() {
  const { refreshEvents, events } = useEvents();
  const [activeTab, setActiveTab] = useState<EntryMode>("matrix");
  const [monthlyDirty, setMonthlyDirty] = useState(false);
  const [date, setDate] = useState(today());

  const { t, setTweak } = useTweaks();

  const [fyStartYear, setFyStartYear] = useState<number>(() => fyContaining(today()).startYear);
  const [fyOpenMonth, setFyOpenMonth] = useState<string>(() => {
    const fy = fyContaining(today());
    return fy.from;
  });

  // Grain-change guard for period grid only
  const prevGrainRef = useRef(t.grain);
  useEffect(() => {
    if (t.grain === prevGrainRef.current) return;
    if (activeTab === "period" && monthlyDirty) {
      const ok = confirm("You have unsaved changes in the period grid that haven't been submitted yet. Switching the Grain will discard them. Continue?");
      if (!ok) {
        setTweak("grain", prevGrainRef.current);
        return;
      }
    }
    prevGrainRef.current = t.grain;
  }, [t.grain, activeTab, monthlyDirty, setTweak]);

  const fyOptions = useMemo(() => {
    const years = new Set<number>([fyContaining(today()).startYear]);
    for (const e of events ?? []) {
      years.add(fyContaining(e.occurredOn.start).startYear);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [events]);

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

  const [ledgerRecords, setLedgerRecords] = useState<any[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerSort, setLedgerSort] = useState<{ col: string; desc: boolean }>({ col: "date", desc: true });

  useEffect(() => {
    loadLedger();
    if (typeof window !== "undefined") {
      const savedOperator = localStorage.getItem("rais_hdr_operator");
      const savedSupervisor = localStorage.getItem("rais_hdr_supervisor");
      const savedMachine = localStorage.getItem("rais_hdr_machine");
      const savedProduct = localStorage.getItem("rais_hdr_product");
      const savedSize = localStorage.getItem("rais_hdr_size");
      const savedBatch = localStorage.getItem("rais_hdr_batch");
      const savedShift = localStorage.getItem("rais_hdr_shift");
      // Mid-path jump from command palette / integrity focus: ?batch=&date=
      const urlParams = new URLSearchParams(window.location.search);
      const urlBatch = urlParams.get("batch");
      const urlDate = urlParams.get("date");

      setHdr((prev) => ({
        shift: savedShift !== null ? savedShift : prev.shift,
        operator: savedOperator !== null ? savedOperator : prev.operator,
        supervisor: savedSupervisor !== null ? savedSupervisor : prev.supervisor,
        machine: savedMachine !== null ? savedMachine : prev.machine,
        product: savedProduct !== null ? savedProduct : prev.product,
        size: savedSize !== null ? savedSize : prev.size,
        batch: urlBatch?.trim() || (savedBatch !== null ? savedBatch : prev.batch),
      }));
      if (urlBatch?.trim()) {
        setLedgerSearch(urlBatch.trim());
      } else if (urlDate?.trim()) {
        setLedgerSearch(urlDate.trim());
      }
      // Land the entry grid on the issue day when deep-linked from integrity focus
      if (urlDate?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(urlDate.trim())) {
        setDate(urlDate.trim());
      }
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

  const confirmLeavePeriodGrid = (): boolean => {
    if (activeTab !== "period" || !monthlyDirty) return true;
    return confirm("You have unsaved changes in the period grid that haven't been submitted yet. Continuing will discard them. Continue?");
  };

  const entryCustomFields = useMemo(
    () => ({
      operator: hdr.operator, supervisor: hdr.supervisor, machine: hdr.machine,
      product: hdr.product, size: hdr.size, batch: hdr.batch, shift: hdr.shift, notes,
    }),
    [hdr, notes],
  );

  const handleEditLedgerRecord = (rec: any) => {
    setHdr({
      shift: rec.shift, operator: rec.operator, supervisor: rec.supervisor,
      product: rec.product, size: rec.size, machine: rec.machine, batch: rec.batch,
    });
    setNotes(rec.notes || "");
    setActiveTab("period");
    setDate(rec.date);
    setSuccess(`Record loaded for editing. Editing date: ${rec.date}. Use Period grid to revise quantities.`);
  };

  const handleDuplicateLedgerRecord = (rec: any) => {
    setHdr({
      shift: rec.shift, operator: rec.operator, supervisor: rec.supervisor,
      product: rec.product, size: rec.size, machine: rec.machine, batch: rec.batch,
    });
    setNotes(rec.notes || "");
    setActiveTab("period");
    setDate(today());
    setSuccess("Header fields duplicated onto today's date. Enter today's quantities and Save.");
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

  const switchTab = (tab: EntryMode) => {
    if (tab !== "period" && !confirmLeavePeriodGrid()) return;
    setActiveTab(tab);
    if (tab === "ledger") loadLedger();
  };

  return (
    <AppShell active="data-entry">
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Data Entry</h1>
      <p className="muted" style={{ fontSize: 13, margin: "0 0 16px", maxWidth: 720, lineHeight: 1.5 }}>
        Primary way to log each shift. Defect columns follow your plant schema after you{" "}
        <a href="/staging" style={{ color: "var(--accent)", fontWeight: 600 }}>Import from Excel</a> once.
        Numbers land on the Dashboard with View Source.
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <TabButton active={activeTab === "matrix"} onClick={() => switchTab("matrix")} first>
            Daily batch entry
          </TabButton>
          <TabButton active={activeTab === "period"} onClick={() => switchTab("period")}>
            Calendar grid
          </TabButton>
          <TabButton active={activeTab === "ledger"} onClick={() => switchTab("ledger")} last>
            History
          </TabButton>
        </div>
      </div>

      {success && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 9, background: "var(--positive-weak)", border: "1px solid var(--positive)", color: "var(--positive)", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 16, color: "var(--positive)", fontWeight: 700 }}>&times;</button>
        </div>
      )}

      {activeTab === "matrix" && (
        <BatchMatrixEntry onSynced={() => loadLedger()} />
      )}

      {activeTab === "period" && (
        <div>
          <p className="small" style={{ color: "var(--text-2)", marginBottom: 12 }}>
            Calendar-period entry driven by verified MOD templates (D/W/M/FY grain). Prefer{" "}
            <strong>Batch Matrix</strong> for shop-floor lot entry.
          </p>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 16, padding: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12 }}>
            <label className="muted" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4 }}>
              {t.grain === "day" && "Report Date"}
              {t.grain === "week" && "Report Week"}
              {t.grain === "month" && "Report Month"}
              {t.grain === "fy" && "Report FY"}

              {t.grain === "day" && (
                <input type="date" value={date} onChange={(e) => {
                  const newDate = e.target.value;
                  if (!confirmLeavePeriodGrid()) return;
                  setDate(newDate);
                }} style={{ ...inp, width: 160 }} />
              )}

              {t.grain === "week" && (
                <WeekPicker value={date} onChange={(next) => {
                  if (!confirmLeavePeriodGrid()) return;
                  setDate(next);
                }} />
              )}

              {t.grain === "month" && (
                <input type="month" value={date.slice(0, 7)} onChange={(e) => {
                  if (!confirmLeavePeriodGrid()) return;
                  setDate(`${e.target.value}-01`);
                }} style={{ ...inp, width: 160 }} />
              )}

              {t.grain === "fy" && (
                <select value={fyStartYear} onChange={(e) => {
                  if (!confirmLeavePeriodGrid()) return;
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
                <input style={inp} value={hdr.batch} onChange={(e) => updateHdrField("batch", e.target.value)} placeholder="e.g. 26F27-14" />
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
                const month = ((i + 3) % 12) + 1;
                const year = month >= 4 ? fyStartYear : fyStartYear + 1;
                const anchor = `${year}-${String(month).padStart(2, "0")}-01`;
                const on = fyOpenMonth.slice(0, 7) === anchor.slice(0, 7);
                const label = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month - 1];
                return (
                  <button key={anchor} onClick={() => { if (confirmLeavePeriodGrid()) setFyOpenMonth(anchor); }}
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
            customFields={entryCustomFields}
            blockedReason={hdr.operator.trim() ? null : "Operator name is required."}
            onDirtyChange={setMonthlyDirty}
          />
        </div>
      )}

      {activeTab === "ledger" && (
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

function TabButton({
  active,
  onClick,
  children,
  first,
  last,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        border: "none",
        borderRadius: first ? "8px 0 0 8px" : last ? "0 8px 8px 0" : 0,
        background: active ? "var(--accent)" : "var(--surface-2)",
        color: active ? "var(--text-invert)" : "var(--text-2)",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

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

const th: React.CSSProperties = {
  padding: "10px 12px",
  fontWeight: 600,
  borderBottom: "1px solid var(--border)"
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  color: "var(--text-2)"
};

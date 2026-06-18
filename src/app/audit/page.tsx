"use client";

import { useEffect, useState, useMemo } from "react";
import AppShell from "@/components/app/AppShell";
import { Card } from "@/components/app/widgets";
import Icon from "@/components/editorial/Icon";

export default function AuditPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");

  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((body) => {
        setEvents(body.events ?? []);
      })
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  // Compute stats for audit header
  const stats = useMemo(() => {
    let productions = 0;
    let inspections = 0;
    let rejections = 0;
    let annotations = 0;
    const fileHashes = new Set<string>();

    events.forEach(e => {
      if (e.eventType === "production") productions++;
      else if (e.eventType === "inspection") inspections++;
      else if (e.eventType === "rejection") rejections++;
      else if (e.eventType === "annotation") annotations++;

      if (e.provenance?.fileHash) {
        fileHashes.add(e.provenance.fileHash);
      }
    });

    return {
      productions,
      inspections,
      rejections,
      annotations,
      files: fileHashes.size
    };
  }, [events]);

  // Find comments (AnnotationEvents) and index them by targetEventIds to show inline comments
  const commentsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    events.forEach(e => {
      if (e.eventType === "annotation" && e.text && Array.isArray(e.targetEventIds)) {
        e.targetEventIds.forEach((targetId: string) => {
          const list = map.get(targetId) ?? [];
          list.push(e.text);
          map.set(targetId, list);
        });
      }
    });
    return map;
  }, [events]);

  // Unique list of stages from events
  const stages = useMemo(() => {
    const set = new Set<string>();
    events.forEach(e => {
      if (e.stageId) {
        set.add(e.stageId);
      }
    });
    return Array.from(set);
  }, [events]);

  // Filtered list
  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      // Exclude base annotations since we show comments inline on their target events
      if (e.eventType === "annotation") return false;

      // Filter by type
      if (typeFilter !== "all" && e.eventType !== typeFilter) {
        return false;
      }

      // Filter by stage
      if (stageFilter !== "all" && e.stageId !== stageFilter) {
        return false;
      }

      // Filter by text search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const eventIdMatch = e.eventId?.toLowerCase().includes(query);
        const fileNameMatch = e.provenance?.file?.toLowerCase().includes(query);
        const stageMatch = e.stageId?.toLowerCase().includes(query);
        const defectMatch = e.defectCodeRaw?.toLowerCase().includes(query);
        
        // Match inline comments text
        const comments = commentsMap.get(e.eventId) ?? [];
        const commentMatch = comments.some(c => c.toLowerCase().includes(query));

        if (!eventIdMatch && !fileNameMatch && !stageMatch && !defectMatch && !commentMatch) {
          return false;
        }
      }

      return true;
    });
  }, [events, typeFilter, stageFilter, searchQuery, commentsMap]);

  const getEventBadgeStyle = (type: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      fontSize: "9px",
      fontWeight: 800,
      padding: "2px 6px",
      borderRadius: "4px",
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      display: "inline-block"
    };

    switch (type) {
      case "production":
        return { ...base, background: "var(--positive-weak)", color: "var(--positive)", border: "1px solid var(--positive)" };
      case "inspection":
        return { ...base, background: "var(--critical-weak)", color: "var(--accent)", border: "1px solid var(--accent)" };
      case "rejection":
        return { ...base, background: "var(--warning-weak)", color: "var(--warning)", border: "1px solid var(--warning)" };
      case "aggregate-claim":
        return { ...base, background: "var(--surface-3)", color: "var(--text-3)", border: "1px solid var(--border)" };
      default:
        return { ...base, background: "var(--surface-2)", color: "var(--text-2)" };
    }
  };

  const getFriendlyStage = (id: string): string => {
    if (id === "visual") return "Visual Inspection";
    if (id === "eye-punching") return "Eye Punching";
    if (id === "balloon") return "Balloon Sealing";
    if (id === "valve-integrity") return "Valve Integrity";
    if (id === "final") return "Final Assembly";
    return id;
  };

  return (
    <AppShell active="audit">
      <div style={{ paddingBottom: 48 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>Audit Trail Ledger</h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Chronological, read-only system ledger of canonical events, cell extraction provenance, and manual operator overrides.</p>
        </div>

        {/* ALCOA+ Data Trust Widgets */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 20 }}>
          <Card title="Source Workbooks">
            <div style={statValStyle}>{stats.files}</div>
            <div className="muted" style={{ fontSize: 11 }}>Ingested files on record</div>
          </Card>
          <Card title="Production Runs">
            <div style={{ ...statValStyle, color: "var(--positive)" }}>{stats.productions.toLocaleString()}</div>
            <div className="muted" style={{ fontSize: 11 }}>Checked input entries</div>
          </Card>
          <Card title="Quality Inspections">
            <div style={{ ...statValStyle, color: "var(--accent)" }}>{stats.inspections.toLocaleString()}</div>
            <div className="muted" style={{ fontSize: 11 }}>Rejected volume logs</div>
          </Card>
          <Card title="Defect Splits">
            <div style={{ ...statValStyle, color: "var(--warning)" }}>{stats.rejections.toLocaleString()}</div>
            <div className="muted" style={{ fontSize: 11 }}>Reason-specific points</div>
          </Card>
          <Card title="Manual Overrides">
            <div style={{ ...statValStyle, color: "#C8421C" }}>{stats.annotations}</div>
            <div className="muted" style={{ fontSize: 11 }}>Operator comments logged</div>
          </Card>
        </div>

        {/* Filters and Search Bar */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 14, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 12 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Icon name="search" size={14} style={{ position: "absolute", left: 12, color: "var(--text-3)" }} />
              <input
                type="text"
                placeholder="Search by filename, comment, event ID, defect code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...inpStyle, paddingLeft: 34 }}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Event Types</option>
              <option value="production">Production Events (Input Qty)</option>
              <option value="inspection">Inspection Events (Rejected Qty)</option>
              <option value="rejection">Rejection Events (Defects)</option>
              <option value="aggregate-claim">Aggregate Claims (Stated %)</option>
            </select>
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Production Stages</option>
              {stages.map((st) => (
                <option key={st} value={st}>{getFriendlyStage(st)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Chronological Logs Table */}
        <Card title={`Chronological Logs (${filteredEvents.length} records)`}>
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              Loading audit logs...
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
              No audit logs match the selected filter query.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ color: "var(--text-3)", textAlign: "left", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Source / Ingestion</th>
                    <th style={thStyle}>Stage</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Quantity</th>
                    <th style={thStyle}>Cell Ref</th>
                    <th style={thStyle}>Extracted By</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.slice(0, 100).map((e, idx) => {
                    const inlineComments = commentsMap.get(e.eventId) ?? [];
                    const rowQty = e.quantity ?? e.statedValue ?? "—";
                    return (
                      <tr key={e.eventId || idx} style={{ borderTop: "1px solid var(--border)", background: inlineComments.length > 0 ? "color-mix(in srgb, var(--warning) 4%, transparent)" : "transparent" }}>
                        <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                          {e.occurredOn?.start || "—"}
                        </td>
                        <td style={tdStyle}>
                          <span style={getEventBadgeStyle(e.eventType)}>{e.eventType}</span>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontWeight: 600 }}>{e.provenance?.file || "Manual Entry"}</span>
                            <span className="muted" style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)" }}>{e.ingestionId?.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td style={tdStyle}>
                          {e.stageId ? getFriendlyStage(e.stageId) : "—"}
                          {e.defectCodeRaw && (
                            <span style={{ marginLeft: 6, fontSize: "10.5px", color: "var(--accent)", fontStyle: "italic" }}>
                              ({e.defectCodeRaw})
                            </span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                          {rowQty}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: "var(--font-mono)" }}>
                          {e.provenance?.cells?.[0] || "ENTRY"}
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span>{e.extractedBy}</span>
                            {inlineComments.map((text, i) => (
                              <div key={i} style={commentBoxStyle}>
                                <Icon name="comment" size={9} style={{ flexShrink: 0, marginTop: 2 }} />
                                <span><strong>Override comment:</strong> &ldquo;{text}&rdquo;</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredEvents.length > 100 && (
                <div className="muted" style={{ fontSize: 11, marginTop: 12, textAlign: "center" }}>
                  Showing first 100 logs. Refine filters to search deeper history.
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

const statValStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "24px",
  fontWeight: 800,
  lineHeight: 1.1,
  marginBottom: 2
};

const inpStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "13px",
  outline: "none"
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "13px",
  fontWeight: 600,
  outline: "none",
  cursor: "pointer"
};

const commentBoxStyle: React.CSSProperties = {
  marginTop: 4,
  background: "var(--surface-3)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: "11px",
  color: "var(--text)",
  display: "flex",
  gap: 6,
  alignItems: "flex-start",
  lineHeight: 1.3
};

const thStyle: React.CSSProperties = { padding: "8px 10px", fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "8px 10px", verticalAlign: "top" };

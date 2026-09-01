"use client";

import type { ReportViewModel, MonthMetricPoint, MetricDisplay } from "@/lib/report/report-model";
import type { StageAnalysisRow } from "@/lib/analytics/rejection";
import type { DefectAnalysisRow } from "@/lib/analytics/defect";
import type { SizeAnalysisRow } from "@/lib/analytics/size";

const PRINT_CSS = `
.ar-doc { color: var(--text); font-size: 14px; line-height: 1.45; }
.ar-doc h1 { font-size: 28px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.02em; color: var(--text); }
.ar-doc h2 { font-size: 18px; font-weight: 600; margin: 28px 0 10px; color: var(--text); }
.ar-doc h3 { font-size: 15px; font-weight: 600; margin: 0 0 8px; color: var(--text); }
.ar-doc .ar-meta { font-size: 13px; color: var(--text-2); display: grid; gap: 4px; }
.ar-doc .ar-meta code, .ar-doc .mono { font-family: var(--font-mono); font-size: 13px; }
.ar-doc .ar-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 12px 0 4px; }
.ar-doc .ar-kpi { border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; background: var(--surface); min-width: 0; }
.ar-doc .ar-kpi-l { font-size: 13px; font-weight: 600; color: var(--text-2); }
.ar-doc .ar-kpi-v { font-family: var(--font-mono); font-size: 22px; font-weight: 700; margin-top: 6px; font-variant-numeric: tabular-nums; }
.ar-doc .ar-kpi-v.unavail { font-family: inherit; font-size: 14px; font-weight: 600; color: var(--text-2); }
.ar-doc table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ar-doc th, .ar-doc td { padding: 7px 6px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
.ar-doc th { font-size: 13px; font-weight: 600; color: var(--text-2); }
.ar-doc td.num { font-family: var(--font-mono); text-align: right; font-variant-numeric: tabular-nums; }
.ar-doc caption { caption-side: top; text-align: left; font-size: 13px; color: var(--text-2); margin-bottom: 6px; }
.ar-doc .ar-note { font-size: 13px; color: var(--text-2); margin: 8px 0; }
.ar-doc .ar-warn { border: 1px solid var(--border-strong); border-radius: 12px; padding: 12px 14px; background: var(--surface-2); }
.ar-doc .ar-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 24px; margin-top: 8px; }
.ar-doc .ar-sign-field { border-bottom: 1px solid var(--border-strong); min-height: 44px; padding-top: 4px; }
.ar-doc .ar-sign-l { font-size: 13px; color: var(--text-2); }
.ar-doc ul { margin: 6px 0 0; padding-left: 18px; }
.ar-doc li { margin: 4px 0; }
@media print {
  .ar-doc {
    color: #14181f !important;
    --text: #14181f; --text-2: #3a4450; --text-3: #5a6570;
    --border: #c8ced6; --border-strong: #9aa3ad;
    --surface: #fff; --surface-2: #eef1f4; --bg: #fff; --accent: #C8421C;
  }
  .ar-doc h1, .ar-doc h2, .ar-doc h3 { color: #14181f !important; }
  .ar-doc .ar-kpi { break-inside: avoid; background: #fff !important; }
  .ar-doc table { page-break-inside: auto; }
  .ar-doc tr { break-inside: avoid; page-break-inside: avoid; }
  .ar-doc thead { display: table-header-group; }
  .ar-doc h2 { break-after: avoid; page-break-after: avoid; }
  .ar-doc .ar-sign { break-inside: avoid; }
  .ar-doc svg { max-width: 100% !important; }
}
`;

function num(n: number): string {
  return n.toLocaleString("en-IN");
}
function pctRatio(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}
function pct100(n: number): string {
  return `${n.toFixed(1)}%`;
}
function dash(v: number | null | undefined, fmt: (n: number) => string = num): string {
  return v == null ? "—" : fmt(v);
}

function metricText(m: MetricDisplay, kind: "number" | "ratio"): string {
  if (m.kind === "unavailable") return m.display;
  if (m.kind === "ratio" || kind === "ratio") return pctRatio(m.value);
  return num(m.value);
}

function MonthBars({ points, title }: { points: MonthMetricPoint[]; title: string }) {
  const w = 640;
  const h = 160;
  const padL = 40;
  const padB = 36;
  const padT = 8;
  const padR = 8;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const rates = points.map((p) => (p.rejectionRate == null ? 0 : p.rejectionRate));
  const max = Math.max(...rates, 0.05);
  const bw = innerW / Math.max(points.length, 1);
  const desc = points
    .map((p) =>
      p.status === "no-qualifying-records"
        ? `${p.shortLabel}: no qualifying records`
        : `${p.shortLabel}: ${p.rejectionRate == null ? "rate not defined" : pctRatio(p.rejectionRate)}`,
    )
    .join("; ");
  return (
    <figure style={{ margin: "8px 0 0" }}>
      <figcaption className="ar-note">{title}</figcaption>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title}>
        <title>{title}</title>
        <desc>{desc}</desc>
        {points.map((p, i) => {
          const x = padL + i * bw + bw * 0.18;
          const barW = bw * 0.64;
          if (p.status === "no-qualifying-records") {
            return (
              <g key={p.key}>
                <line
                  x1={x}
                  x2={x + barW}
                  y1={padT + innerH}
                  y2={padT + innerH}
                  stroke="var(--border-strong)"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
                <text x={x + barW / 2} y={h - 12} textAnchor="middle" fontSize="13" fill="var(--text-3)">
                  {p.shortLabel}
                </text>
              </g>
            );
          }
          const val = p.rejectionRate ?? 0;
          const bh = (val / max) * innerH;
          return (
            <g key={p.key}>
              <rect
                x={x}
                y={padT + innerH - bh}
                width={barW}
                height={Math.max(bh, val === 0 ? 1 : 0)}
                fill="var(--accent)"
              />
              <text x={x + barW / 2} y={h - 12} textAnchor="middle" fontSize="13" fill="var(--text-2)">
                {p.shortLabel}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="ar-note">
        Dashed baseline = no qualifying records that month (not an operational zero).
      </p>
    </figure>
  );
}

function RankBars({
  rows,
  title,
  caption,
}: {
  rows: { label: string; value: number; sub?: string }[];
  title: string;
  caption: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  return (
    <figure style={{ margin: "8px 0 16px" }}>
      <figcaption className="ar-note">{title}. {caption}</figcaption>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.label}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, marginBottom: 4 }}>
              <span>{r.label}{r.sub ? <span className="ar-note"> · {r.sub}</span> : null}</span>
              <span className="mono">{num(r.value)}</span>
            </div>
            <div style={{ height: 8, background: "var(--surface-2)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${(r.value / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

function StageTable({ rows, denomNote }: { rows: StageAnalysisRow[]; denomNote: string }) {
  return (
    <table>
      <caption>
        Stage comparison. Rejected contribution = {denomNote}. Accepted quantity is not a confirmed plant-wide formula.
      </caption>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Stage</th>
          <th scope="col" className="num">Checked</th>
          <th scope="col">Accepted</th>
          <th scope="col" className="num">Rejected</th>
          <th scope="col" className="num">Rejection rate</th>
          <th scope="col" className="num">Pass-through</th>
          <th scope="col" className="num">Rejected contrib.</th>
          <th scope="col" className="num">Events</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.stageId}>
            <td className="num">{r.rank ?? "—"}</td>
            <td>
              {r.label}
              {r.unmapped ? " (unmapped)" : ""}
              {r.status === "no-qualifying-records" ? " — no qualifying records" : ""}
            </td>
            <td className="num">{r.status === "no-qualifying-records" ? "—" : num(r.checked)}</td>
            <td>Needs company confirmation</td>
            <td className="num">{r.status === "no-qualifying-records" ? "—" : num(r.rejected)}</td>
            <td className="num">{r.rejRate == null ? "—" : pctRatio(r.rejRate)}</td>
            <td className="num">{r.yield == null ? "—" : pctRatio(r.yield)}</td>
            <td className="num">{r.contributionPct == null ? "—" : pct100(r.contributionPct)}</td>
            <td className="num">{num(r.sourceEventCount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DefectTable({ rows, note }: { rows: DefectAnalysisRow[]; note: string }) {
  return (
    <table>
      <caption>Defect Pareto. {note}. Unresolved codes are shown verbatim. Unclassified is missing code and raw label.</caption>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Defect</th>
          <th scope="col">Kind</th>
          <th scope="col" className="num">Rejected</th>
          <th scope="col" className="num">Share</th>
          <th scope="col" className="num">Cumulative</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.kind}-${r.defectCode ?? r.label}`}>
            <td className="num">{r.rank}</td>
            <td>{r.label}</td>
            <td>
              {r.kind === "resolved" ? "Resolved" : r.kind === "unresolved-raw" ? "Unresolved code" : "Unclassified"}
            </td>
            <td className="num">{num(r.rejected)}</td>
            <td className="num">{pct100(r.pct)}</td>
            <td className="num">{pct100(r.cumPct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SizeTable({ rows, rejNote, chkNote }: { rows: SizeAnalysisRow[]; rejNote: string; chkNote: string }) {
  return (
    <table>
      <caption>
        Size comparison. Rejected contribution = {rejNote}. Checked contribution = {chkNote}. Accepted quantity needs company confirmation.
      </caption>
      <thead>
        <tr>
          <th scope="col">Rank</th>
          <th scope="col">Size</th>
          <th scope="col" className="num">Checked</th>
          <th scope="col">Accepted</th>
          <th scope="col" className="num">Rejected</th>
          <th scope="col" className="num">Rejection rate</th>
          <th scope="col" className="num">Rejected contrib.</th>
          <th scope="col" className="num">Checked contrib.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.size}>
            <td className="num">{r.rank ?? "—"}</td>
            <td>{r.size}{r.unclassified ? " (missing size)" : ""}</td>
            <td className="num">{num(r.checked)}</td>
            <td>Needs company confirmation</td>
            <td className="num">{num(r.rejected)}</td>
            <td className="num">{r.rejRate == null ? "—" : pctRatio(r.rejRate)}</td>
            <td className="num">{r.rejectedContributionPct == null ? "—" : pct100(r.rejectedContributionPct)}</td>
            <td className="num">{r.checkedContributionPct == null ? "—" : pct100(r.checkedContributionPct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AuditReportDocument({ model }: { model: ReportViewModel }) {
  const id = model.identity;
  const v = model.validation;
  const generated = new Date(id.generatedAt);
  const generatedLabel = Number.isNaN(generated.getTime())
    ? id.generatedAt
    : generated.toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return (
    <article className="ar-doc">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <header>
        <h1>{id.title}</h1>
        <div className="ar-meta">
          <div><strong>Report type:</strong> {id.title.split(" · ")[0]}</div>
          <div><strong>Period:</strong> {id.periodCaption}</div>
          <div>
            <strong>Exact dates:</strong>{" "}
            <span className="mono">{id.dateFrom}</span>
            {" → "}
            <span className="mono">{id.dateTo}</span>
            {" (inclusive)"}
          </div>
          <div><strong>Date basis:</strong> {id.dateBasisLabel}</div>
          <div><strong>Sources:</strong> {id.sourceSummary}</div>
          <div><strong>Batches:</strong> {id.batchSummary}</div>
          <div><strong>Generated:</strong> <span className="mono">{generatedLabel}</span></div>
          <div>
            Numbers are computed from the append-only event ledger by deterministic TypeScript analytics.
            This document is a ledger extract, not a certification of compliance.
          </div>
        </div>
      </header>

      <section>
        <h2>Scope and calculation basis</h2>
        <p className="ar-note">{id.calculationBasis}</p>
        <p className="ar-note">Rework policy in force: {id.policyReworkCountsAs}.</p>
        {id.notes ? <p>{id.notes}</p> : null}
      </section>

      <section>
        <h2>Data coverage and integrity</h2>
        <ul>
          {v.coverage.statements.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="ar-note">
          {v.coverage.sourceChannelBreakdown.excel.toLocaleString("en-IN")} Excel events ·{" "}
          {v.coverage.sourceChannelBreakdown.directEntry.toLocaleString("en-IN")} data-entry events ·{" "}
          {v.coverage.includedFileCount} files · {v.coverage.includedBatchCount} batches ·{" "}
          {v.coverage.correctionCount} correction events
        </p>
        {v.missingEntryDateCount > 0 && (
          <p className="ar-warn">
            {v.missingEntryDateCount} events had a missing or invalid Date of Entry and were excluded.
            They were not reassigned to lot date or occurredOn.
          </p>
        )}
      </section>

      {model.fundamentals && (
        <section>
          <h2>Cumulative fundamentals</h2>
          <div className="ar-kpis">
            <div className="ar-kpi">
              <div className="ar-kpi-l">Checked</div>
              <div className="ar-kpi-v">{metricText(model.fundamentals.checked, "number")}</div>
            </div>
            <div className="ar-kpi">
              <div className="ar-kpi-l">Rejected</div>
              <div className="ar-kpi-v">{metricText(model.fundamentals.rejected, "number")}</div>
            </div>
            <div className="ar-kpi">
              <div className="ar-kpi-l">Rejection rate</div>
              <div className="ar-kpi-v">{metricText(model.fundamentals.rejectionRate, "ratio")}</div>
            </div>
            <div className="ar-kpi">
              <div className="ar-kpi-l">Accepted</div>
              <div className={`ar-kpi-v ${model.fundamentals.accepted.kind === "unavailable" ? "unavail" : ""}`}>
                {metricText(model.fundamentals.accepted, "number")}
              </div>
            </div>
            <div className="ar-kpi">
              <div className="ar-kpi-l">First-pass yield</div>
              <div className="ar-kpi-v">{metricText(model.fundamentals.fpy, "ratio")}</div>
            </div>
          </div>
          <p className="ar-note">
            First-pass yield is rolled-throughput yield Π(1 − stage rate) from the existing plant formula.
            Accepted is not derived as checked minus rejected.
          </p>

          <h3>Monthly trend</h3>
          <MonthBars points={model.fundamentals.monthly} title="Headline rejection rate by month of Date of Entry" />
          <table>
            <caption>Monthly fundamentals. Months without qualifying records are not operational zeros.</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Events</th>
                <th scope="col" className="num">Checked</th>
                <th scope="col" className="num">Rejected</th>
                <th scope="col" className="num">Rejection rate</th>
              </tr>
            </thead>
            <tbody>
              {model.fundamentals.monthly.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td>
                    {m.status === "no-qualifying-records"
                      ? "No qualifying records"
                      : m.status === "confirmed-zero"
                        ? "Records present; checked and rejected are zero"
                        : "Qualifying records"}
                  </td>
                  <td className="num">{num(m.qualifyingEventCount)}</td>
                  <td className="num">{dash(m.checked)}</td>
                  <td className="num">{dash(m.rejected)}</td>
                  <td className="num">{m.rejectionRate == null ? "—" : pctRatio(m.rejectionRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Deterministic patterns</h3>
          {model.fundamentals.patterns.length === 0 ? (
            <p className="ar-note">No patterns could be evaluated from the qualifying records.</p>
          ) : (
            <ul>
              {model.fundamentals.patterns.map((p) => (
                <li key={p.id}>
                  <strong>{p.title}:</strong> {p.value}
                  {p.period ? ` (${p.period})` : ""}. {p.rule}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {model.stage && (
        <section>
          <h2>Stage-wise analysis</h2>
          <RankBars
            title="Rejected quantity by stage"
            caption={`Denominator: ${num(model.stage.rejectedDenominator)} rejected. ${model.stage.rejectedDenominatorNote}.`}
            rows={model.stage.rows
              .filter((r) => r.status === "has-records")
              .map((r) => ({ label: r.label, value: r.rejected }))}
          />
          <StageTable rows={model.stage.rows} denomNote={model.stage.rejectedDenominatorNote} />
          {model.stage.unmappedEventCount > 0 && (
            <p className="ar-warn">
              {num(model.stage.unmappedEventCount)} events have no valid stage. They appear in the unmapped row.
            </p>
          )}
        </section>
      )}

      {model.defect && (
        <section>
          <h2>Defect-wise analysis</h2>
          <RankBars
            title="Top defects by rejected quantity"
            caption={
              model.defect.otherRejected > 0
                ? `Top ${model.defect.topN.length} shown. Other remainder: ${num(model.defect.otherRejected)}. ${model.defect.denominatorNote}.`
                : model.defect.denominatorNote
            }
            rows={[
              ...model.defect.topN.map((r) => ({ label: r.label, value: r.rejected })),
              ...(model.defect.otherRejected > 0
                ? [{ label: "Other", value: model.defect.otherRejected }]
                : []),
            ]}
          />
          <DefectTable rows={model.defect.rows} note={model.defect.denominatorNote} />
        </section>
      )}

      {model.size && (
        <section>
          <h2>Size-wise analysis</h2>
          <p className="ar-note">
            Size-tagged events: {num(model.size.sizeTaggedEventCount)}. Missing size: {num(model.size.missingSizeEventCount)}.
            Size-analysis population is not implied to equal the full plant population when size coverage is incomplete.
          </p>
          <RankBars
            title="Rejected quantity by size"
            caption={model.size.rejectedDenominatorNote}
            rows={model.size.rows.map((r) => ({ label: r.size, value: r.rejected }))}
          />
          <SizeTable
            rows={model.size.rows}
            rejNote={model.size.rejectedDenominatorNote}
            chkNote={model.size.checkedDenominatorNote}
          />
        </section>
      )}

      <section>
        <h2>Evidence appendix</h2>
        {model.evidence.truncationNote && <p className="ar-warn">{model.evidence.truncationNote}</p>}
        {model.evidence.rows.length === 0 ? (
          <p className="ar-note">No qualifying events to list.</p>
        ) : (
          <table>
            <caption>
              Qualifying ledger events ({num(model.evidence.rows.length)}
              {model.evidence.truncated ? ` of ${num(model.evidence.total)}` : ""}). Date of Entry from recordedAt.
            </caption>
            <thead>
              <tr>
                <th scope="col">Entry date</th>
                <th scope="col">Type</th>
                <th scope="col">Stage</th>
                <th scope="col">Size</th>
                <th scope="col" className="num">Qty</th>
                <th scope="col">Source</th>
                <th scope="col">Event id</th>
              </tr>
            </thead>
            <tbody>
              {model.evidence.rows.map((r) => (
                <tr key={r.eventId}>
                  <td className="mono">{r.entryDate ?? "—"}</td>
                  <td>{r.eventType}</td>
                  <td className="mono">{r.stageId ?? "—"}</td>
                  <td className="mono">{r.size ?? "—"}</td>
                  <td className="num">{r.quantity == null ? "—" : num(r.quantity)}</td>
                  <td>{r.file ?? "—"}</td>
                  <td className="mono">{r.eventId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Human review / sign-off</h2>
        <p className="ar-note">{model.signOff.label}</p>
        <div className="ar-sign">
          {model.signOff.fields.map((f) => (
            <div key={f.id} className="ar-sign-field">
              <div className="ar-sign-l">{f.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Limitations and unresolved company confirmations</h2>
        <ul>
          {model.limitations.map((l) => (
            <li key={l.slice(0, 80)}>{l}</li>
          ))}
        </ul>
      </section>
    </article>
  );
}

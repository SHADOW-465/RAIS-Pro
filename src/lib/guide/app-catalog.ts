// Static product knowledge for Ask MOID guide mode.
// Pure data — every screen, how-to, and common workflow the plant actually uses.
// Numbers never live here; only navigation and procedure.

import { NAV_ROUTES, type NavKey } from "@/lib/nav-keys";

export interface AppFeature {
  id: string;
  navKey: NavKey;
  label: string;
  href: string;
  /** Free-text match tokens (lowercased at match time). */
  keywords: string[];
  /** One-line "what is this screen". */
  summary: string;
  /** Exact steps a GM / QM / engineer follows. */
  howTo: string[];
  tips?: string[];
}

export interface AppWorkflow {
  id: string;
  title: string;
  keywords: string[];
  summary: string;
  steps: { text: string; href?: string; navKey?: NavKey }[];
}

/** Prose only. label + href come from NAV_ROUTES so a moved or deleted route
 *  cannot leave a stale link buried in the how-to copy. */
const FEATURE_PROSE: Omit<AppFeature, "label" | "href">[] = [
  {
    id: "dashboard",
    navKey: "dashboard",
    keywords: ["dashboard", "home", "overview", "factory", "kpis", "cockpit", "status"],
    summary: "Factory KPIs, rejection trend, and View Source over the live ledger.",
    howTo: [
      "Open Dashboard from the left sidebar (Overview → Dashboard).",
      "Use the top bar View control to scope one gate (Visual / Balloon / Valve / Final) or stay on Cumulative.",
      "Set Interval (day / week / month / FY) and Range (dates) so numbers match the period you care about.",
      "Click any KPI or chart segment and use View Source to see the contributing ledger events.",
      "Use the Sources control when you need Excel-only, Data Entry–only, or a specific batch/file.",
    ],
    tips: [
      "Every number here is computed from ledger events — never invented by AI.",
      "Empty dashboard usually means nothing is committed yet: enter data or finish Staging.",
    ],
  },
  {
    id: "data-entry",
    navKey: "data-entry",
    keywords: [
      "data entry", "enter data", "batch matrix", "log", "capture", "manual entry",
      "today's production", "record production", "shop floor", "daily entry",
    ],
    summary: "Primary day-to-day capture: batch matrix and period grids using your plant column names.",
    howTo: [
      "Open Your data → Data Entry in the sidebar.",
      "Pick the period (day / week / month) in the top bar Interval control.",
      "Enter or select the Batch ID, then fill checked / rejected quantities per stage and size.",
      "Defect columns come from your plant schema (or the Disposafe fallback if schema is empty).",
      "Save the row — it writes StageDayRecords through /api/ingest into the append-only ledger.",
      "Use the history / ledger tab on the same page to review or correct earlier entries.",
    ],
    tips: [
      "Prefer Data Entry for daily ops; Excel import is for bulk history and schema teaching.",
      "If columns look wrong, fix them on Plant Schema (/schema) — Data Entry is generated from the catalog.",
    ],
  },
  {
    id: "workbooks",
    navKey: "workbooks",
    keywords: [
      "excel", "upload", "import", "workbook", "spreadsheet", "bulk", "history load",
      "mod", "mapping", "staging",
    ],
    summary: "Upload plant Excel, verify column mapping (MOD), extract day-records, commit to the ledger.",
    howTo: [
      "Open Your data → Excel Data.",
      "Upload the workbook (Import tab). MOID profiles columns and builds a draft MOD (mapping).",
      "Review each column mapping — accept, reassign, or mark ignore. Publish only when verified.",
      "After publish, extract records and review them in Staging / review before commit.",
      "Commit approved records — they become ledger events. Dashboard and analysis light up automatically.",
      "Use the Files tab to see prior uploads and MOD lineage (deleting a file does not wipe the plant catalog).",
    ],
    tips: [
      "You only teach the schema once; later workbooks reuse learned aliases.",
      "Draft MODs never extract — only verified / published MODs unlock extraction.",
    ],
  },
  {
    id: "staging",
    navKey: "staging",
    keywords: ["staging", "review records", "extract", "verify mapping", "pending commit"],
    summary: "Review extracted day-records before they hit the ledger.",
    howTo: [
      "Open Staging after a verified MOD extract (or via Excel Data flow).",
      "Check each day-record: stage, size, quantities, defects.",
      "Fix obvious errors, then commit — ingest emits append-only events.",
      "Re-ingesting identical data dedups; corrections supersede, they never hard-delete facts.",
    ],
  },
  {
    id: "stage",
    navKey: "stage",
    keywords: ["stage analysis", "by stage", "gate", "visual", "balloon", "valve", "final", "inspection point"],
    summary: "Rejection and yield broken down by inspection gate.",
    howTo: [
      "Open Analysis → By Stage.",
      "Scope the period with Interval + Range in the top bar.",
      "Click a stage bar or row to focus that gate; View Source shows contributing events.",
      "Ask MOID things like “balloon gate July” to land here with scope already applied.",
    ],
  },
  {
    id: "size",
    navKey: "size",
    keywords: ["size analysis", "by size", "french", "fr", "size concentration", "24fr"],
    summary: "Size / French-size concentration of rejection and volume.",
    howTo: [
      "Open Analysis → By Size.",
      "Set the date range you care about.",
      "Select a size (e.g. 24Fr) to focus charts and tables.",
      "Use View Source on a metric to audit the underlying events.",
    ],
  },
  {
    id: "defect",
    navKey: "defect",
    keywords: ["defect analysis", "pareto", "defect", "scrap reason", "nonconformance", "top defects"],
    summary: "Pareto of defect reasons — what is driving scrap.",
    howTo: [
      "Open Analysis → By Defect.",
      "Scope period (and stage View if you want one gate only).",
      "Read the Pareto: left bars are the vital few reasons.",
      "Click a defect to filter; open CAPA from a finding when you need an action owner.",
    ],
  },
  {
    id: "spc",
    navKey: "spc",
    keywords: ["spc", "control chart", "xbar", "process control", "out of control", "rules"],
    summary: "Control charts and rule violations over the ledger series.",
    howTo: [
      "Open Analysis → SPC & Control Charts.",
      "Pick grain and date range so the series is dense enough for control limits.",
      "Watch for points outside limits and rule runs (trending, shifts).",
      "Investigate with View Source, then raise CAPA if the process is unstable.",
    ],
  },
  {
    id: "process-flow",
    navKey: "process-flow",
    keywords: ["process flow", "fpy", "funnel", "yield flow", "line flow"],
    summary: "Stage-to-stage flow and first-pass yield narrative.",
    howTo: [
      "Open Analysis → Process Flow.",
      "Read the funnel / stage narrative for the scoped period.",
      "Compare FPY and drop-offs between gates — numbers still come from the ledger.",
    ],
  },
  {
    id: "copq",
    navKey: "copq",
    keywords: ["copq", "cost", "savings", "rupee", "money", "cost of poor quality", "scrap cost"],
    summary: "Cost of poor quality and savings opportunity from rejection volume.",
    howTo: [
      "Open Analysis → Cost of Rejection.",
      "Ensure unit costs are set under Settings if figures look zero.",
      "Scope the period; COPQ scales rejection counts by configured cost.",
      "Use the savings opportunity as a prioritization input for CAPA.",
    ],
  },
  {
    id: "reports",
    navKey: "reports",
    keywords: [
      "report", "reports", "print", "pdf", "monthly pack", "weekly report",
      "financial year", "fy audit", "date of entry", "gm report", "summary pack",
    ],
    summary: "Financial-year and custom Date of Entry reports over the ledger — preview, then print / PDF.",
    howTo: [
      "Open Management → Reports.",
      "Choose a report type (Financial Year Audit Pack, Fundamentals, Stage, Defect, or Size).",
      "Select a financial year or a custom Date of Entry range.",
      "Check the coverage strip, then Print / Save as PDF from the browser dialog.",
    ],
    tips: [
      "Ask MOID: “summarize July first week report” — it scopes the week, summarizes verified KPIs, and can open Reports for you.",
    ],
  },
  {
    id: "capa",
    navKey: "capa",
    keywords: ["capa", "corrective action", "action", "owner", "ncr", "close capa"],
    summary: "Recommended and open corrective / preventive actions.",
    howTo: [
      "Open Management → CAPA & Actions.",
      "Review rule-driven recommendations from the decision engine.",
      "Compose a CAPA with problem statement, owner, and due date.",
      "Track status; link back to the defect or stage that triggered it.",
    ],
  },
  {
    id: "audit",
    navKey: "audit",
    keywords: ["audit", "provenance", "trail", "who changed", "trust", "history of events"],
    summary: "Append-only history of ledger events and corrections for trust / audit.",
    howTo: [
      "Open Management → Audit Trail.",
      "Filter by date range / batch if needed.",
      "Each row is a content-addressed event — corrections appear as new events, not edits.",
      "Use this when an auditor asks “where did this number come from?”.",
    ],
  },
  {
    id: "schema",
    navKey: "schema",
    keywords: [
      "schema", "plant schema", "catalog", "stages", "defects list", "rename defect",
      "master data", "data schema",
    ],
    summary: "Company catalog of stages, sizes, defects — drives Data Entry columns and analytics labels.",
    howTo: [
      "Open Management → Plant Schema.",
      "Add, rename, or retire stages / defects / sizes.",
      "Changes override entry-template so Data Entry picks them up next load.",
      "Do not delete catalog items that still appear on historical events without a migration plan.",
    ],
  },
  {
    id: "settings",
    navKey: "settings",
    keywords: ["settings", "preferences", "theme", "target", "unit cost", "persona"],
    summary: "Targets, cost assumptions, and UI preferences.",
    howTo: [
      "Open Management → Settings.",
      "Set rejection targets and per-unit costs used by COPQ.",
      "Adjust theme / density if available via Tweaks.",
      "Switch role (GM / QM / Owner / …) from the top bar persona control — it filters the sidebar.",
    ],
  },
  {
    id: "ask",
    navKey: "ask",
    keywords: ["ask moid", "assistant", "copilot", "chat"],
    summary: "The assistant panel: answers grounded on the ledger, navigates, scopes, and drafts entries.",
    howTo: [
      "Open Management → Ask MOID in the sidebar, or the round button bottom-right.",
      "Ask a metric question (“what is rejection rate this month?”) for a grounded answer.",
      "Ask a how-to (“how do I import Excel?”) for exact steps and a Take me there button.",
      "Ask it to act (“summarize July first week”) — it scopes the screen and opens the page for you.",
      "State quantities (“visual checked 400 rejected 12”) and it drafts the entry for you to confirm.",
    ],
  },
];

export const APP_FEATURES: AppFeature[] = FEATURE_PROSE.map((f) => ({
  ...f,
  label: NAV_ROUTES[f.navKey].label,
  href: NAV_ROUTES[f.navKey].href ?? "",
}));

export const APP_WORKFLOWS: AppWorkflow[] = [
  {
    id: "first-setup",
    title: "First-time plant setup",
    keywords: ["get started", "setup", "first time", "onboard", "start using", "configure plant"],
    summary: "Teach MOID your schema once, load history, then enter daily on the matrix.",
    steps: [
      { text: "Upload a representative Excel workbook under Excel Data.", href: "/workbooks", navKey: "workbooks" },
      { text: "Verify every column mapping and publish the MOD (plant schema is learned).", href: "/workbooks", navKey: "workbooks" },
      { text: "Extract and commit historical day-records so the dashboard has real numbers.", href: "/staging", navKey: "staging" },
      { text: "Confirm stages/defects on Plant Schema; tweak labels if operators use different names.", href: "/schema", navKey: "schema" },
      { text: "From tomorrow, use Data Entry for daily capture — no re-typing column names.", href: "/data-entry", navKey: "data-entry" },
      { text: "Set unit costs and targets in Settings if you use COPQ.", href: "/settings", navKey: "settings" },
    ],
  },
  {
    id: "daily-entry",
    title: "Daily production entry",
    keywords: ["daily entry", "enter today", "log today", "morning entry", "end of shift", "shift entry"],
    summary: "How operators / engineers log a production day.",
    steps: [
      { text: "Go to Data Entry.", href: "/data-entry", navKey: "data-entry" },
      { text: "Set Interval to Day and pick today’s date (or the shift date).", href: "/data-entry", navKey: "data-entry" },
      { text: "Enter Batch ID, then fill checked / rejected / defects per stage and size.", href: "/data-entry", navKey: "data-entry" },
      { text: "Save — the ledger updates; Dashboard reflects the new day immediately.", href: "/", navKey: "dashboard" },
    ],
  },
  {
    id: "weekly-gm-review",
    title: "Weekly GM quality review",
    keywords: [
      "weekly review", "gm review", "management review", "weekly report",
      "week summary", "executive review",
    ],
    summary: "Scope one week, read KPIs, open the report pack, raise CAPA if needed.",
    steps: [
      { text: "Ask MOID to summarize the week (e.g. “summarize July first week”) or set Range manually on Dashboard.", href: "/", navKey: "dashboard" },
      { text: "Check By Defect Pareto for the same period — vital few reasons.", href: "/defect-analysis", navKey: "defect" },
      { text: "Check By Stage if one gate is driving scrap.", href: "/stage-analysis", navKey: "stage" },
      { text: "Open Reports, keep the same Range, pick GM monthly (or your preset), Print / PDF.", href: "/reports", navKey: "reports" },
      { text: "Open CAPA for any systemic issue and assign an owner.", href: "/capa", navKey: "capa" },
    ],
  },
  {
    id: "import-excel",
    title: "Import historical Excel",
    keywords: ["import excel", "load excel", "bulk upload", "upload history", "bring excel"],
    summary: "Bulk path from plant workbook to ledger facts.",
    steps: [
      { text: "Excel Data → upload file.", href: "/workbooks", navKey: "workbooks" },
      { text: "Verify MOD mappings → publish.", href: "/workbooks", navKey: "workbooks" },
      { text: "Extract records → review in Staging → commit to ledger.", href: "/staging", navKey: "staging" },
      { text: "Confirm on Dashboard with Range covering the imported dates.", href: "/", navKey: "dashboard" },
    ],
  },
  {
    id: "investigate-spike",
    title: "Investigate a rejection spike",
    keywords: ["spike", "investigate", "why high rejection", "what went wrong", "root cause"],
    summary: "From alert to gate → defect → batch → CAPA.",
    steps: [
      { text: "Dashboard: note the period and rate; open View Source on the KPI.", href: "/", navKey: "dashboard" },
      { text: "By Stage: which gate moved?", href: "/stage-analysis", navKey: "stage" },
      { text: "By Defect: which reasons dominate the Pareto?", href: "/defect-analysis", navKey: "defect" },
      { text: "By Size / Sources: isolate size or batch concentration.", href: "/size-analysis", navKey: "size" },
      { text: "SPC: is the process out of control or a one-off?", href: "/spc", navKey: "spc" },
      { text: "CAPA: open an action with evidence links.", href: "/capa", navKey: "capa" },
    ],
  },
];

/** Suggested starter chips shown in the floating widget. */
export const GUIDE_SUGGESTIONS = [
  "How do I enter today's data?",
  "Summarize this month",
  "How do I import Excel?",
  "Open defect analysis",
  "Weekly GM review",
  "Where is the plant schema?",
];

function norm(s: string): string {
  return s.toLowerCase().trim();
}

/** Best feature match by keyword / label score. */
export function matchFeature(query: string): { feature: AppFeature; score: number } | null {
  const q = norm(query);
  if (!q) return null;
  let best: { feature: AppFeature; score: number } | null = null;
  for (const f of APP_FEATURES) {
    let score = 0;
    if (norm(f.label) === q) score = 1;
    else if (q.includes(norm(f.label))) score = Math.max(score, 0.85);
    else if (norm(f.label).includes(q) && q.length >= 4) score = Math.max(score, 0.75);
    for (const kw of f.keywords) {
      const k = norm(kw);
      if (q === k) score = Math.max(score, 1);
      else if (q.includes(k) && k.length >= 3) score = Math.max(score, 0.8 + Math.min(0.15, k.length / 40));
      else if (k.includes(q) && q.length >= 4) score = Math.max(score, 0.65);
    }
    if (score > 0 && (!best || score > best.score)) best = { feature: f, score };
  }
  return best && best.score >= 0.65 ? best : null;
}

/** Renamed from matchWorkflow: agent/workflows.ts exports a different function
 *  of the same name and both barrels use `export *`. */
export function matchGuideWorkflow(query: string): { workflow: AppWorkflow; score: number } | null {
  const q = norm(query);
  if (!q) return null;
  let best: { workflow: AppWorkflow; score: number } | null = null;
  for (const w of APP_WORKFLOWS) {
    let score = 0;
    if (norm(w.title) === q) score = 1;
    else if (q.includes(norm(w.title))) score = 0.9;
    for (const kw of w.keywords) {
      const k = norm(kw);
      if (q === k) score = Math.max(score, 1);
      else if (q.includes(k) && k.length >= 4) score = Math.max(score, 0.82);
    }
    if (score > 0 && (!best || score > best.score)) best = { workflow: w, score };
  }
  return best && best.score >= 0.75 ? best : null;
}

/** Compact catalog text for LLM system prompts (guide fallback). */
export function catalogForPrompt(): string {
  const lines = APP_FEATURES.map(
    (f) => `- ${f.label} (${f.href}): ${f.summary}`,
  );
  const flows = APP_WORKFLOWS.map((w) => `- Workflow “${w.title}”: ${w.summary}`);
  return [
    "MOID application screens:",
    ...lines,
    "",
    "Common workflows:",
    ...flows,
  ].join("\n");
}

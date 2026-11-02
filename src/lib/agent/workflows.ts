// Multi-step “do the review for me” workflows (Monday GM pack, setup, spike).

import type { NavKey } from "@/lib/nav-keys";
import type { InvestigationState } from "@/lib/analytics/investigation-state";
import { hrefForNav } from "@/lib/analytics/intent";
import { parseDatePhrase } from "@/lib/analytics/date-phrase";
import type { ReportSlots } from "./types";

export interface WorkflowStep {
  id: string;
  title: string;
  /** User-facing instruction for this step */
  instruction: string;
  navKey?: NavKey;
  href?: string;
  /** When true, run summarize for current report slots / period */
  summarize?: boolean;
  /** When true, open reports with scope */
  openReports?: boolean;
}

export interface WorkflowDef {
  id: string;
  title: string;
  keywords: string[];
  summary: string;
  steps: WorkflowStep[];
}

export const AGENT_WORKFLOWS: WorkflowDef[] = [
  {
    id: "monday-gm",
    title: "Monday GM quality pack",
    keywords: [
      "monday gm",
      "monday review",
      "gm pack",
      "gm review",
      "weekly gm",
      "management review pack",
      "monday gm review",
      "weekly review pack",
    ],
    summary: "Scope last week → dashboard → defects → stage → reports ready to print.",
    steps: [
      {
        id: "scope",
        title: "Scope the week",
        instruction: "Applying period scope (last week, or the period you named).",
        summarize: true,
        navKey: "dashboard",
        href: "/",
      },
      {
        id: "defects",
        title: "Defect Pareto",
        instruction: "Open By Defect for the same period — vital few reasons.",
        navKey: "defect",
        href: "/quality/defect",
      },
      {
        id: "stages",
        title: "By Stage",
        instruction: "Check which gate is driving scrap.",
        navKey: "stage",
        href: "/quality/stage",
      },
      {
        id: "reports",
        title: "Reports pack",
        instruction: "Open Reports with this range — Print / PDF when ready.",
        openReports: true,
        navKey: "reports",
        href: "/reports",
      },
      {
        id: "capa",
        title: "CAPA (optional)",
        instruction: "Raise CAPA if something systemic showed up.",
        navKey: "capa",
        href: "/actions/capa",
      },
    ],
  },
  {
    id: "investigate-spike",
    title: "Investigate rejection spike",
    keywords: [
      "investigate spike",
      "rejection spike",
      "why high rejection",
      "what went wrong",
      "root cause",
      "investigate rejection",
    ],
    summary: "Dashboard → stage → defect → size → SPC → CAPA.",
    steps: [
      {
        id: "dash",
        title: "Dashboard",
        instruction: "Start on Dashboard with the period in scope.",
        summarize: true,
        navKey: "dashboard",
        href: "/",
      },
      {
        id: "stage",
        title: "By Stage",
        instruction: "Which gate moved?",
        navKey: "stage",
        href: "/quality/stage",
      },
      {
        id: "defect",
        title: "By Defect",
        instruction: "Which reasons dominate the Pareto?",
        navKey: "defect",
        href: "/quality/defect",
      },
      {
        id: "size",
        title: "By Size",
        instruction: "Any size concentration?",
        navKey: "size",
        href: "/quality/size",
      },
      {
        id: "spc",
        title: "SPC",
        instruction: "Is the process out of control or a one-off?",
        navKey: "spc",
        href: "/quality/spc",
      },
      {
        id: "capa",
        title: "CAPA",
        instruction: "Open CAPA and assign an owner if needed.",
        navKey: "capa",
        href: "/actions/capa",
      },
    ],
  },
  {
    id: "first-setup",
    title: "First-time plant setup",
    keywords: ["get started", "first time", "setup plant", "onboard", "first-time setup"],
    summary: "Excel → verify MOD → commit history → schema → daily entry.",
    steps: [
      {
        id: "excel",
        title: "Excel Data",
        instruction: "Upload a representative workbook and verify mappings.",
        navKey: "workbooks",
        href: "/excel/files",
      },
      {
        id: "schema",
        title: "Plant Schema",
        instruction: "Confirm stages/defects labels operators will see.",
        navKey: "schema",
        href: "/setup/schema",
      },
      {
        id: "entry",
        title: "Data Entry",
        instruction: "From tomorrow, use Data Entry for daily capture.",
        navKey: "data-entry",
        href: "/log/entry",
      },
      {
        id: "settings",
        title: "Settings",
        instruction: "Set unit costs/targets if you use COPQ.",
        navKey: "settings",
        href: "/setup/settings",
      },
    ],
  },
];

export function matchWorkflow(text: string): WorkflowDef | null {
  const t = text.toLowerCase().trim();
  let best: { w: WorkflowDef; score: number } | null = null;
  for (const w of AGENT_WORKFLOWS) {
    let score = 0;
    if (t === w.title.toLowerCase()) score = 1;
    for (const kw of w.keywords) {
      if (t === kw) score = Math.max(score, 1);
      else if (t.includes(kw)) score = Math.max(score, 0.85);
    }
    if (score >= 0.85 && (!best || score > best.score)) best = { w, score };
  }
  return best?.w ?? null;
}

/** Default period for workflows when user didn’t name one. */
export function defaultWorkflowPeriod(
  text: string,
  dataMaxIso: string,
): ReportSlots {
  const named = parseDatePhrase(text, dataMaxIso);
  if (named) {
    return {
      from: named.from,
      to: named.to,
      grain: named.grain,
      periodLabel: named.matchedText,
    };
  }
  // Monday pack / spike → last week relative to data
  const last = parseDatePhrase("last week", dataMaxIso);
  if (last) {
    return {
      from: last.from,
      to: last.to,
      grain: "week",
      periodLabel: "last week",
    };
  }
  return {};
}

export function workflowStateFromSlots(slots: ReportSlots): InvestigationState | null {
  if (!slots.from || !slots.to) return null;
  return {
    grain: slots.grain ?? "week",
    from: slots.from,
    to: slots.to,
    label: slots.periodLabel,
  };
}

export function stepHref(step: WorkflowStep): string {
  if (step.href) return step.href;
  if (step.navKey) return hrefForNav(step.navKey);
  return "/";
}

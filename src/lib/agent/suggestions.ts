// Role-aware starter chips + context-aware tips for Ask MOID.

import type { PersonaId } from "@/lib/persona";
import { modernPath } from "@/lib/nav-keys";

export interface StarterChip {
  label: string;
  text: string;
}

/** Empty-ledger / first-run tips. */
export function contextTips(opts: {
  eventCount: number;
  currentPath?: string;
  persona: PersonaId | string;
  canWrite: boolean;
}): string | null {
  const path = opts.currentPath ?? "/";
  if (opts.eventCount === 0) {
    if (opts.canWrite) {
      return (
        "**No ledger events yet.** Start with Data Entry or import Excel — " +
        "or tell me: “enter assembly checked …” / “how do I import Excel?”"
      );
    }
    return (
      "**No ledger events yet.** Ask a GM/operator to enter data or import Excel, " +
      "then I can summarize and open reports for you."
    );
  }

  if (path.startsWith("/log/entry")) {
    return opts.canWrite
      ? "You’re on **Data Entry** — paste quantities here and I’ll draft a save (with confirm)."
      : "You’re on **Data Entry** (view-only role). Switch persona to enter, or ask for a summary instead.";
  }
  if (path.startsWith("/reports")) {
    return "You’re on **Reports** — say a period (“this month”, “july first week”) and I’ll scope + summarize.";
  }
  if (path === "/" || path === "") {
    return "On the **Dashboard** — try “summarize this month” or “Monday GM review”.";
  }
  if (path.startsWith("/defect")) {
    return "On **Defect analysis** — ask “top defects this month” or open a report for the same range.";
  }
  return null;
}

/** Persona-specific starter chips (short labels for the widget). */
export function roleStarterChips(persona: PersonaId | string): StarterChip[] {
  const common: StarterChip[] = [
    { label: "Monday GM pack", text: "Monday GM review" },
    { label: "July week 1 report", text: "summarize july first week report" },
  ];

  if (persona === "operator") {
    return [
      {
        label: "Enter assembly row",
        text: "enter assembly checked 400 accepted 390 coag 5 sd 3 bl 2",
      },
      { label: "How to enter today", text: "how do I enter today's data?" },
      { label: "Import Excel?", text: "how do I import Excel?" },
      ...common.slice(0, 1),
    ];
  }

  if (persona === "owner") {
    return [
      { label: "This month summary", text: "summarize this month" },
      { label: "July week 1 report", text: "summarize july first week report" },
      { label: "Monday GM pack", text: "Monday GM review" },
      { label: "Defect analysis", text: "open defect analysis" },
    ];
  }

  // GM
  return [
    {
      label: "Enter assembly…",
      text: "enter assembly checked 400 accepted 390 coag 5 sd 3 bl 2",
    },
    { label: "Monday GM pack", text: "Monday GM review" },
    { label: "July week 1 report", text: "summarize july first week report" },
    { label: "Investigate spike", text: "investigate rejection spike" },
    { label: "Get started", text: "get started" },
  ];
}

/** Spotlight nav key after howto — client pulses sidebar item. */
export function spotlightNavFromHref(rawHref: string): string | null {
  const href = modernPath(rawHref);
  if (href === "/" || href === "") return "dashboard";
  if (href.startsWith("/log/entry")) return "data-entry";
  if (href.startsWith("/excel/files")) return "workbooks";
  if (href.startsWith("/excel/import")) return "staging";
  if (href.startsWith("/quality/stage")) return "stage";
  if (href.startsWith("/quality/size")) return "size";
  if (href.startsWith("/quality/defect")) return "defect";
  if (href.startsWith("/quality/spc")) return "spc";
  if (href.startsWith("/quality/flow")) return "process-flow";
  if (href.startsWith("/cost")) return "copq";
  if (href.startsWith("/actions/capa")) return "capa";
  if (href.startsWith("/reports/audit")) return "audit";
  if (href.startsWith("/reports")) return "reports";
  if (href.startsWith("/setup/schema")) return "schema";
  if (href.startsWith("/setup/settings")) return "settings";
  return null;
}

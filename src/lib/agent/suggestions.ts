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

/**
 * The 4 Ask MOID starter chips (plan §3f): plain questions about the plant's
 * own data. View-only roles get a summary instead of a CAPA draft; operators
 * get entry questions instead of plant-wide diagnosis.
 */
export function roleStarterChips(persona: PersonaId | string): StarterChip[] {
  const chip = (text: string): StarterChip => ({ label: text, text });
  if (persona === "operator") {
    return [
      chip("Which lots are stalled?"),
      chip("How do I enter today's data?"),
      chip("Which stage is worst this month?"),
      chip("How do I import Excel?"),
    ];
  }
  if (persona === "owner") {
    return [
      chip("Why did rejections rise this week?"),
      chip("Which stage is worst this month?"),
      chip("Which lots are stalled?"),
      chip("Summarize this month"),
    ];
  }
  return [
    chip("Why did rejections rise this week?"),
    chip("Which stage is worst this month?"),
    chip("Which lots are stalled?"),
    chip("Draft a CAPA for the top defect"),
  ];
}

/** Short answer first: the first paragraph, plus whether there is more to show. */
export function splitAnswer(text: string): { short: string; more: string } {
  const t = text.trim();
  const i = t.indexOf("\n\n");
  return i < 0 ? { short: t, more: "" } : { short: t.slice(0, i), more: t.slice(i + 2).trim() };
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

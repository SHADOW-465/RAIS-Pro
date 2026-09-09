// Deterministic Ask MOID guide resolver.
// Classifies a free-text ask into how-to / navigate / analyze / workflow and
// returns copy + deep-link actions. AI is only used later for prose over
// verified figures — never for routing truth.

import type { Event } from "@/lib/store/types";
import type { RoleId } from "@/lib/persona";
import { personaAllowsNav } from "@/lib/persona";
import type { NavKey } from "@/lib/nav-keys";
import type { InvestigationState } from "@/lib/analytics/investigation-state";
import {
  resolveIntentDeterministic,
  hrefForNav,
  CONFIDENT,
  type IntentCtx,
} from "@/lib/analytics/intent";
import { parseDatePhrase } from "@/lib/analytics/date-phrase";
import {
  APP_FEATURES,
  matchFeature,
  matchGuideWorkflow,
  type AppFeature,
  type AppWorkflow,
} from "./app-catalog";

export type GuideMode = "howto" | "navigate" | "analyze" | "workflow" | "fallback";

export interface GuideAction {
  label: string;
  href: string;
  navKey?: NavKey;
  /** When set, AppShell applies grain/dates/stage before navigating. */
  state?: InvestigationState;
  /** Auto-run this navigation (high-confidence “do it for me”). */
  auto?: boolean;
}

export interface GuideResult {
  mode: GuideMode;
  /** Message shown in the floating widget. */
  text: string;
  /** Optional numbered steps for how-to / workflows. */
  steps?: string[];
  actions: GuideAction[];
  /** When mode=analyze, call /api/chat with this scoped config. */
  analyze?: {
    question: string;
    state: InvestigationState;
    periodLabel: string;
  };
  confidence: number;
}

export interface GuideCtx {
  events: Event[];
  persona: RoleId;
  dataMaxIso: string;
  /** Current path for context-aware tips (optional). */
  currentPath?: string;
  currentScope?: InvestigationState;
}

const HOWTO_RE =
  /\b(how (do i|to|can i|do we|should i)|where (is|do i|can i|to)|show me how|guide me|help me (with|to|do)|what is|what's|explain|teach me|walk me)\b/i;

const NAV_RE =
  /\b(take me|go to|open|navigate|bring me|show me the|jump to|switch to)\b/i;

const ANALYZE_RE =
  /\b(summarize|summary|recap|overview of|what('s| is) (my|the|our)|how (bad|high|much|many)|tell me about|analyze|analysis of|report (for|on|of)|figures? for|numbers? for|kpi)\b/i;

const REPORT_RE = /\b(report|reports|pdf|print pack|forensic)\b/i;

function periodLabel(state: InvestigationState): string {
  if (state.from && state.to) return `${state.from} → ${state.to}`;
  if (state.from) return `from ${state.from}`;
  return "current scope";
}

function featureAllowed(f: AppFeature, persona: RoleId): boolean {
  return personaAllowsNav(persona, f.navKey);
}

function formatHowTo(f: AppFeature): GuideResult {
  const steps = f.howTo;
  const tips = f.tips?.length ? `\n\nTips:\n${f.tips.map((t) => `• ${t}`).join("\n")}` : "";
  return {
    mode: "howto",
    text: `**${f.label}** — ${f.summary}\n\nHere's exactly how:${tips}`,
    steps,
    actions: [
      {
        label: `Open ${f.label}`,
        href: f.href,
        navKey: f.navKey,
        auto: false,
      },
    ],
    confidence: 0.95,
  };
}

function formatWorkflow(w: AppWorkflow, persona: RoleId): GuideResult {
  const steps = w.steps.map((s) => s.text);
  const actions: GuideAction[] = [];
  for (const s of w.steps) {
    if (!s.href || !s.navKey) continue;
    if (!personaAllowsNav(persona, s.navKey)) continue;
    if (actions.some((a) => a.href === s.href)) continue;
    actions.push({
      label: s.navKey === "data-entry" ? "Open Data Entry" : `Open ${s.navKey}`,
      href: s.href,
      navKey: s.navKey,
    });
  }
  // Prefer first step as primary CTA
  if (w.steps[0]?.href && w.steps[0]?.navKey && personaAllowsNav(persona, w.steps[0].navKey)) {
    actions.unshift({
      label: "Start this workflow",
      href: w.steps[0].href,
      navKey: w.steps[0].navKey,
      auto: false,
    });
    // dedupe first
    const seen = new Set<string>();
    const deduped: GuideAction[] = [];
    for (const a of actions) {
      const k = `${a.label}|${a.href}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(a);
    }
    return {
      mode: "workflow",
      text: `**${w.title}** — ${w.summary}\n\nFollow these steps:`,
      steps,
      actions: deduped.slice(0, 4),
      confidence: 0.92,
    };
  }
  return {
    mode: "workflow",
    text: `**${w.title}** — ${w.summary}\n\nFollow these steps:`,
    steps,
    actions: actions.slice(0, 4),
    confidence: 0.9,
  };
}

function intentToState(ctx: GuideCtx, text: string): {
  state: InvestigationState;
  navKey: NavKey;
  confidence: number;
  matched: ReturnType<typeof resolveIntentDeterministic>["matched"];
} {
  const intentCtx: IntentCtx = {
    events: ctx.events,
    currentScope: ctx.currentScope ?? { grain: "month" },
    persona: ctx.persona,
    dataMaxIso: ctx.dataMaxIso,
  };
  const r = resolveIntentDeterministic(text, intentCtx);
  return {
    state: r.state,
    navKey: r.navKey,
    confidence: r.confidence,
    matched: r.matched,
  };
}

/** Force reports destination when user clearly wants a report pack. */
function preferReports(text: string, navKey: NavKey): NavKey {
  if (REPORT_RE.test(text) && (ANALYZE_RE.test(text) || NAV_RE.test(text) || /\breport\b/i.test(text))) {
    return "reports";
  }
  return navKey;
}

/**
 * Resolve a user question into a guide response.
 * Pure and synchronous — safe to unit test and run on the client.
 */
export function resolveGuide(text: string, ctx: GuideCtx): GuideResult {
  const q = text.trim();
  if (!q) {
    return {
      mode: "fallback",
      text: "Ask me how to use any screen, or tell me what you want to do — e.g. “summarize July first week report”.",
      actions: [],
      confidence: 0,
    };
  }

  const isHowTo = HOWTO_RE.test(q);
  const isNav = NAV_RE.test(q);
  const isAnalyze = ANALYZE_RE.test(q);
  const feat = matchFeature(q);
  const flow = matchGuideWorkflow(q);

  // 1) Explicit how-to + feature
  if (isHowTo && feat && featureAllowed(feat.feature, ctx.persona)) {
    return formatHowTo(feat.feature);
  }

  // 2) Workflow recipes (get started, weekly review, …)
  if (flow && (isHowTo || flow.score >= 0.85 || !isAnalyze)) {
    // Prefer workflow when clearly matched and not a pure metric question
    if (!isAnalyze || flow.score >= 0.9) {
      return formatWorkflow(flow.workflow, ctx.persona);
    }
  }

  // 3) How-to without strong feature: try workflow, else generic catalog tip
  if (isHowTo && !feat) {
    if (flow) return formatWorkflow(flow.workflow, ctx.persona);
    return {
      mode: "howto",
      text:
        "I can walk you through any screen. Try naming the task, for example:\n" +
        "• “How do I enter today’s data?”\n" +
        "• “How do I import Excel?”\n" +
        "• “Where is the plant schema?”\n" +
        "• “How do I print a monthly report?”",
      actions: APP_FEATURES.filter((f) => featureAllowed(f, ctx.persona))
        .slice(0, 4)
        .map((f) => ({ label: f.label, href: f.href, navKey: f.navKey })),
      confidence: 0.4,
    };
  }

  // 4) Analyze / summarize — compute scope, optional auto-open
  if (isAnalyze || (REPORT_RE.test(q) && parseDatePhrase(q, ctx.dataMaxIso))) {
    const { state, navKey: rawNav, confidence, matched } = intentToState(ctx, q);
    let navKey = preferReports(q, rawNav);
    // Summaries default to reports when user said report, else dashboard
    if (REPORT_RE.test(q)) navKey = "reports";
    else if (confidence < CONFIDENT && !matched.metric && !matched.stage && !matched.defect) {
      navKey = "dashboard";
    }
    if (!personaAllowsNav(ctx.persona, navKey)) {
      navKey = personaAllowsNav(ctx.persona, "dashboard") ? "dashboard" : "data-entry";
    }

    const period = parseDatePhrase(q, ctx.dataMaxIso);
    if (period) {
      state.grain = period.grain;
      state.from = period.from;
      state.to = period.to;
    }
    // Default grain week when analyzing a week phrase
    if (!state.from) {
      // keep intent state
    }

    const label = periodLabel(state);
    const dest = APP_FEATURES.find((f) => f.navKey === navKey);
    const href = hrefForNav(navKey);
    const autoNav = confidence >= CONFIDENT || !!period || REPORT_RE.test(q);

    const bits = [
      matched.period || period?.matchedText,
      matched.stage,
      matched.size,
      matched.defect,
      matched.metric,
    ].filter(Boolean);

    return {
      mode: "analyze",
      text: autoNav
        ? `I'll scope **${label}**${bits.length ? ` (${bits.join(" · ")})` : ""} and summarize verified ledger figures. Opening **${dest?.label ?? navKey}** so you can dig in.`
        : `I'll summarize verified figures for **${label}**. Use the button if you want the full screen.`,
      actions: [
        {
          label: dest ? `Open ${dest.label}` : "Open view",
          href,
          navKey,
          state: { ...state, label: bits.join(" · ") || label },
          auto: autoNav,
        },
      ],
      analyze: {
        question: q,
        state: { ...state, label: bits.join(" · ") || label },
        periodLabel: label,
      },
      confidence: Math.max(confidence, period ? 0.75 : 0.55),
    };
  }

  // 5) Explicit navigate / open X
  if (isNav || (feat && feat.score >= 0.8)) {
    if (feat && featureAllowed(feat.feature, ctx.persona)) {
      const { state, matched } = intentToState(ctx, q);
      const period = parseDatePhrase(q, ctx.dataMaxIso);
      if (period) {
        state.grain = period.grain;
        state.from = period.from;
        state.to = period.to;
      }
      const hasScope = !!(state.from || state.stage || state.size || state.batch || state.metric);
      return {
        mode: "navigate",
        text: hasScope
          ? `Taking you to **${feat.feature.label}** with scope applied${matched.period ? ` (${matched.period})` : ""}.`
          : `Opening **${feat.feature.label}** — ${feat.feature.summary}`,
        actions: [
          {
            label: `Open ${feat.feature.label}`,
            href: feat.feature.href,
            navKey: feat.feature.navKey,
            state: hasScope ? state : undefined,
            auto: true,
          },
        ],
        confidence: feat.score,
      };
    }
  }

  // 6) Intent-based navigation (entity / metric / period)
  {
    const { state, navKey, confidence, matched } = intentToState(ctx, q);
    if (confidence >= CONFIDENT) {
      const dest = APP_FEATURES.find((f) => f.navKey === navKey);
      const label =
        [matched.defect, matched.stage, matched.size, matched.metric, matched.period]
          .filter(Boolean)
          .join(" · ") || dest?.label || navKey;
      return {
        mode: "navigate",
        text: `Opening **${dest?.label ?? navKey}** for **${label}**.`,
        actions: [
          {
            label: `Open ${dest?.label ?? navKey}`,
            href: hrefForNav(navKey),
            navKey,
            state: { ...state, label },
            auto: true,
          },
        ],
        confidence,
      };
    }
  }

  // 7) Bare feature name → short intro + open
  if (feat && featureAllowed(feat.feature, ctx.persona) && feat.score >= 0.75) {
    return {
      mode: "navigate",
      text: `**${feat.feature.label}** — ${feat.feature.summary}\n\nSay “how do I use ${feat.feature.label}?” for step-by-step instructions.`,
      actions: [
        {
          label: `Open ${feat.feature.label}`,
          href: feat.feature.href,
          navKey: feat.feature.navKey,
          auto: false,
        },
      ],
      confidence: feat.score,
    };
  }

  // 8) Workflow soft match
  if (flow) return formatWorkflow(flow.workflow, ctx.persona);

  // 9) Fallback — let the client call AI chat with catalog context
  return {
    mode: "fallback",
    text: "",
    actions: [],
    confidence: 0.2,
  };
}

export function isGuideFallback(r: GuideResult): boolean {
  return r.mode === "fallback" && !r.text;
}

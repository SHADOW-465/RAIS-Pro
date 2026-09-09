// Pure turn reducer for Ask MOID task agent.
// Session in → message → session out + reply + tool intents (client executes).

import { resolveGuide, isGuideFallback } from "@/lib/guide/resolve-guide";
import { parseDatePhrase } from "@/lib/analytics/date-phrase";
import type { Event } from "@/lib/store/types";
import type { RoleId } from "@/lib/persona";
import {
  classifyTaskKind,
  isCancelMessage,
  isConfirmMessage,
  hasExecuteLanguage,
} from "./classify";
import { extractEntrySlots, normalizeDefectKeys } from "./extract-entry-slots";
import { applyStageInference } from "./infer-stage";
import {
  chipSuggestions,
  missingEntrySlots,
  missingReportSlots,
  questionForMissing,
  validateEntryBalance,
  defectSum,
} from "./missing-slots";
import { buildEntryDraft, buildReportDraft, finalizeEntrySlots } from "./build-draft";
import {
  clearSession,
  mergeEntrySlots,
  mergeReportSlots,
  newSession,
  touch,
} from "./session";
import {
  matchWorkflow,
  defaultWorkflowPeriod,
  workflowStateFromSlots,
  stepHref,
  AGENT_WORKFLOWS,
  type WorkflowDef,
} from "./workflows";
import { contextTips, spotlightNavFromHref } from "./suggestions";
import { prefillDataEntryHref, investigationShareUrl } from "./prefill";
import type {
  AgentAction,
  AgentCtx,
  AgentReply,
  AgentSession,
  EntrySlots,
  ReportSlots,
  ToolIntent,
  TurnResult,
} from "./types";

function chipsToActions(missing: string[]): AgentAction[] {
  return chipSuggestions(missing).map((c, i) => ({
    id: `chip-${i}-${c.text}`,
    label: c.label,
    kind: c.text === "cancel" ? "cancel" : "chip",
    chipText: c.text,
  }));
}

function cancelReply(): TurnResult {
  return {
    session: null,
    reply: {
      text: "Cancelled. Tell me what you need next — enter data, summarize a period, or how to use a screen.",
      actions: [],
      autoTools: [],
    },
  };
}

function formatEntryCollecting(
  session: AgentSession,
  preamble?: string,
): AgentReply {
  const missing = session.missing;
  const notes = session.notes.length ? session.notes.join("\n") + "\n\n" : "";
  const err = session.validationError
    ? `**Check quantities:** ${session.validationError}\n\n`
    : "";
  const known: string[] = [];
  const s = session.entrySlots;
  if (s.macro) known.push(`section=${s.macro}`);
  if (s.processName || s.stageId) known.push(`gate=${s.processName ?? s.stageId}`);
  if (s.checked != null) known.push(`checked=${s.checked}`);
  if (s.acceptedGood != null) known.push(`accepted=${s.acceptedGood}`);
  if (s.rejected != null || defectSum(s.defects))
    known.push(`rejected=${s.rejected ?? defectSum(s.defects)}`);
  if (s.defects && Object.keys(s.defects).length)
    known.push(
      `defects=${Object.entries(s.defects)
        .map(([k, v]) => `${k}:${v}`)
        .join(",")}`,
    );

  const text =
    (preamble ? preamble + "\n\n" : "") +
    notes +
    err +
    (known.length ? `I have: ${known.join(" · ")}\n\n` : "") +
    `I still need:\n${questionForMissing(missing)}\n\n` +
    `Reply in one line if you want — e.g. “today, 26A01-16, 16Fr”.`;

  return {
    text,
    actions: [
      ...chipsToActions(missing),
      { id: "cancel", label: "Cancel", kind: "cancel", chipText: "cancel" },
    ],
    autoTools: [],
  };
}

function formatEntryConfirm(session: AgentSession, canWrite: boolean): AgentReply {
  const draft = session.draft;
  if (!draft || draft.kind !== "enter_data") {
    return { text: "Draft missing.", actions: [], autoTools: [] };
  }
  const lines = draft.summaryRows.map((r) => `• **${r.label}:** ${r.value}`).join("\n");
  const warn = draft.warnings.length
    ? "\n\n" + draft.warnings.map((w) => `⚠ ${w}`).join("\n")
    : "";
  const writeNote = canWrite
    ? "\n\nTap **Confirm & save** to write this to the ledger (same path as Data Entry)."
    : "\n\nYour role cannot write to the ledger. Switch to GM/Operator or open Data Entry.";

  const prefillHref = prefillDataEntryHref(draft);
  const actions: AgentAction[] = canWrite
    ? [
        { id: "confirm", label: "Confirm & save", kind: "confirm_ingest" },
        {
          id: "prefill",
          label: "Open Data Entry (prefill)",
          kind: "prefill_entry",
          href: prefillHref,
        },
        { id: "cancel", label: "Cancel", kind: "cancel", chipText: "cancel" },
      ]
    : [
        {
          id: "prefill",
          label: "Open Data Entry (prefill)",
          kind: "prefill_entry",
          href: prefillHref,
        },
        { id: "cancel", label: "Cancel", kind: "cancel", chipText: "cancel" },
      ];

  return {
    text:
      `**Ready to save** — please confirm:\n\n${lines}${warn}${writeNote}\n\n` +
      `Or **Open Data Entry (prefill)** to review the matrix UI first.`,
    actions,
    autoTools: [],
    draft,
  };
}

function processEntrySlots(
  raw: EntrySlots,
  sessionNotes: string[],
): { slots: EntrySlots; notes: string[]; error: string | null } {
  let slots = { ...raw };
  const notes = [...sessionNotes];

  // Default macro to assembly when defects look like plant defects
  if (!slots.macro && (slots.defects || slots.checked != null)) {
    slots.macro = "assembly";
  }

  const inferred = applyStageInference(slots);
  slots = inferred.slots;
  if (inferred.note && !notes.includes(inferred.note)) notes.push(inferred.note);

  // Normalize defect keys once we know the station
  if (slots.defects && slots.macro && slots.stageId) {
    const { defects, unknown } = normalizeDefectKeys(
      slots.defects,
      slots.macro,
      slots.stageId,
    );
    slots.defects = defects;
    if (unknown.length) {
      return {
        slots,
        notes,
        error: `Unknown defect code(s): ${unknown.join(", ")}. Use plant codes like COAG, SD, BL.`,
      };
    }
  }

  slots = finalizeEntrySlots(slots);
  const error = validateEntryBalance(slots);
  return { slots, notes, error };
}

function advanceEntry(
  session: AgentSession,
  extracted: EntrySlots,
  ctx: AgentCtx,
  preamble?: string,
): TurnResult {
  const merged = mergeEntrySlots(session.entrySlots, extracted);
  const { slots, notes, error } = processEntrySlots(merged, session.notes);
  let next = touch(session, {
    entrySlots: slots,
    notes,
    validationError: error,
  });

  if (error) {
    next = touch(next, {
      status: "collecting",
      missing: missingEntrySlots(slots),
      draft: undefined,
    });
    return { session: next, reply: formatEntryCollecting(next, preamble) };
  }

  const missing = missingEntrySlots(slots);
  if (missing.length) {
    next = touch(next, { status: "collecting", missing, draft: undefined });
    return { session: next, reply: formatEntryCollecting(next, preamble) };
  }

  const draft = buildEntryDraft(slots);
  if (!draft) {
    next = touch(next, {
      status: "collecting",
      missing: missingEntrySlots(slots),
    });
    return { session: next, reply: formatEntryCollecting(next, preamble) };
  }

  next = touch(next, { status: "confirming", missing: [], draft });
  return { session: next, reply: formatEntryConfirm(next, ctx.canWrite) };
}

function extractReportSlots(text: string, dataMaxIso: string): ReportSlots {
  const period = parseDatePhrase(text, dataMaxIso);
  if (!period) return {};
  return {
    from: period.from,
    to: period.to,
    grain: period.grain,
    periodLabel: period.matchedText,
  };
}

function advanceReport(
  session: AgentSession,
  extracted: ReportSlots,
  kind: "report" | "analyze",
  question: string,
): TurnResult {
  const slots = mergeReportSlots(session.reportSlots, extracted);
  const missing = missingReportSlots(slots);
  if (missing.length) {
    const next = touch(session, {
      reportSlots: slots,
      status: "collecting",
      missing,
      kind,
    });
    return {
      session: next,
      reply: {
        text:
          `I'll ${kind === "report" ? "summarize and open Reports" : "summarize the ledger"} once I know the period.\n\n` +
          `I still need:\n${questionForMissing(missing)}`,
        actions: chipsToActions(missing),
        autoTools: [],
      },
    };
  }

  const draft = buildReportDraft(slots, kind);
  if (!draft) {
    return {
      session: touch(session, { status: "collecting", missing: ["period"] }),
      reply: {
        text: "I couldn't build a period from that. Try “this month” or “july first week”.",
        actions: chipsToActions(["period"]),
        autoTools: [],
      },
    };
  }

  const tools: ToolIntent[] = [
    { type: "apply_scope", state: draft.state },
    {
      type: "summarize",
      state: draft.state,
      periodLabel: draft.periodLabel,
      question,
    },
  ];
  if (kind === "report") {
    tools.push({
      type: "open_reports",
      state: draft.state,
      presetId: draft.presetId,
    });
  } else {
    tools.push({
      type: "navigate",
      href: draft.href,
      state: draft.state,
      label: "Dashboard",
    });
  }

  const next = touch(session, {
    status: "done",
    reportSlots: slots,
    draft,
    missing: [],
  });

  const openLine =
    kind === "report"
      ? `Opening **Reports** with this range — use Print / Save as PDF when ready.`
      : `Opening **Dashboard** scoped to this period.`;

  const sharePath = kind === "report" ? "/reports" : "/";
  const shareUrl = investigationShareUrl(sharePath, {
    grain: draft.state.grain,
    from: draft.state.from,
    to: draft.state.to,
    stage: draft.state.stage,
  });

  return {
    session: next,
    reply: {
      text:
        `Scoped **${draft.periodLabel}** (${draft.state.from} → ${draft.state.to}).\n\n` +
        openLine +
        `\n\n_Summary loading from verified ledger figures…_`,
      actions: [
        {
          id: "open",
          label: kind === "report" ? "Open Reports" : "Open Dashboard",
          kind: kind === "report" ? "open_reports" : "navigate",
          href: draft.href,
          state: draft.state,
        },
        {
          id: "share",
          label: "Copy share link",
          kind: "copy_link",
          copyText: shareUrl,
        },
      ],
      autoTools: tools,
      draft,
    },
  };
}

function formatWorkflowStep(
  def: WorkflowDef,
  stepIndex: number,
  slots: ReportSlots,
  periodLabel: string,
): { text: string; actions: AgentAction[]; autoTools: ToolIntent[]; steps: string[] } {
  const step = def.steps[stepIndex];
  const total = def.steps.length;
  const progress = def.steps.map((s, i) => {
    const mark = i < stepIndex ? "✓" : i === stepIndex ? "→" : "·";
    return `${mark} ${s.title}`;
  });

  const state = workflowStateFromSlots(slots);
  const href = stepHref(step);
  const tools: ToolIntent[] = [];
  if (state) tools.push({ type: "apply_scope", state });
  if (step.summarize && state) {
    tools.push({
      type: "summarize",
      state,
      periodLabel,
      question: `${def.title} · ${step.title}`,
    });
  }
  if (step.openReports && state) {
    tools.push({ type: "open_reports", state, presetId: "builtin:gm-monthly" });
  } else if (step.href || step.navKey) {
    tools.push({
      type: "navigate",
      href,
      state: state ?? undefined,
      label: step.title,
    });
  }
  const spot = spotlightNavFromHref(href);
  if (spot) tools.push({ type: "spotlight", navKey: spot });

  const isLast = stepIndex >= total - 1;
  const actions: AgentAction[] = [
    {
      id: "open-step",
      label: `Open ${step.title}`,
      kind: step.openReports ? "open_reports" : "navigate",
      href,
      state: state ?? undefined,
      spotlightNav: spot ?? undefined,
    },
  ];
  if (!isLast) {
    actions.push({
      id: "next",
      label: "Next step",
      kind: "workflow_next",
      chipText: "next",
    });
  }
  actions.push({ id: "cancel", label: "End pack", kind: "cancel", chipText: "cancel" });

  if (state) {
    actions.push({
      id: "share",
      label: "Copy share link",
      kind: "copy_link",
      copyText: investigationShareUrl(href, {
        grain: state.grain,
        from: state.from,
        to: state.to,
        stage: state.stage,
      }),
    });
  }

  return {
    text:
      `**${def.title}** — step ${stepIndex + 1}/${total}: **${step.title}**\n\n` +
      `${step.instruction}\n\n` +
      (periodLabel ? `Period: **${periodLabel}**\n\n` : "") +
      progress.join("\n") +
      (step.summarize ? "\n\n_Summary loading from verified ledger figures…_" : ""),
    actions,
    autoTools: tools,
    steps: progress,
  };
}

/** "what is this graph?" — answered from the currently open KPI/chart, never
 *  invented. Nothing to collect or confirm, so this is a one-shot reply. */
function formatExplainReply(ctx: AgentCtx): TurnResult {
  const m = ctx.activeMetric;
  if (!m) {
    return {
      session: null,
      reply: {
        text:
          "Nothing is open right now. Click a KPI tile or a chart segment, " +
          "then ask again — I'll read straight off what View Source shows for it.",
        actions: [],
        autoTools: [],
      },
    };
  }

  const lines: string[] = [`**${m.title}**`];
  if (m.primaryValue) lines.push(`Computed value: **${m.primaryValue}**.`);

  const span =
    m.dateFrom && m.dateTo
      ? m.dateFrom === m.dateTo
        ? `on ${m.dateFrom}`
        : `${m.dateFrom} → ${m.dateTo}`
      : null;
  const traced = [
    m.checkedQty > 0 ? `${m.checkedQty.toLocaleString()} checked` : null,
    m.acceptedQty > 0 ? `${m.acceptedQty.toLocaleString()} accepted` : null,
    m.rejectedQty > 0 ? `${m.rejectedQty.toLocaleString()} rejected` : null,
    m.reworkQty > 0 ? `${m.reworkQty.toLocaleString()} held/rework` : null,
  ].filter((x): x is string => !!x);
  if (traced.length) {
    lines.push(
      `Traced to **${m.recordCount}** ledger record${m.recordCount === 1 ? "" : "s"}` +
        `${span ? ` ${span}` : ""}: ${traced.join(" · ")}.`,
    );
  }
  if (m.topDriver) {
    lines.push(`Main driver: **${m.topDriver.label}** (${m.topDriver.sharePct.toFixed(0)}% of it).`);
  }
  if (m.insight) lines.push(m.insight);

  return {
    session: null,
    reply: {
      text: lines.join("\n\n"),
      actions: [{ id: "spotlight", label: "Highlight it", kind: "spotlight" }],
      autoTools: [{ type: "spotlight_metric" }],
    },
  };
}

/** "export this page" / "download report" — the same two actions the top-bar
 *  Export button already runs; this only chooses between them. */
function formatExportReply(ctx: AgentCtx): TurnResult {
  const text = ctx.canExportReport
    ? "Opening the report builder for this screen — pick sections and Print/PDF from there."
    : "This screen has no report builder — downloading the audit package (CSV extracts + manifest) instead.";
  return {
    session: null,
    reply: {
      text,
      actions: [],
      autoTools: [{ type: "export_report" }],
    },
  };
}

function startWorkflow(text: string, ctx: AgentCtx): TurnResult {
  const def = matchWorkflow(text) ?? AGENT_WORKFLOWS.find((w) => w.id === "monday-gm")!;
  const period = defaultWorkflowPeriod(text, ctx.dataMaxIso);
  const missing = missingReportSlots(period);
  if (missing.length && def.id !== "first-setup") {
    const session = touch(newSession("workflow", "collecting"), {
      reportSlots: period,
      missing,
      workflow: { workflowId: def.id, stepIndex: 0, title: def.title },
      notes: [`Starting **${def.title}** — need a period first.`],
    });
    return {
      session,
      reply: {
        text:
          `**${def.title}** — ${def.summary}\n\n` +
          `Which period should I use?\n${questionForMissing(missing)}`,
        actions: chipsToActions(missing),
        autoTools: [],
      },
    };
  }

  // first-setup needs no period
  const slots =
    def.id === "first-setup"
      ? period
      : Object.keys(period).length
        ? period
        : defaultWorkflowPeriod("last week", ctx.dataMaxIso);

  const session = touch(newSession("workflow", "collecting"), {
    reportSlots: slots,
    missing: [],
    workflow: { workflowId: def.id, stepIndex: 0, title: def.title },
  });
  const periodLabel =
    slots.periodLabel ||
    (slots.from && slots.to ? `${slots.from} → ${slots.to}` : "all data");
  const formatted = formatWorkflowStep(def, 0, slots, periodLabel);
  return {
    session,
    reply: {
      text: `Starting **${def.title}**.\n\n${formatted.text}`,
      steps: formatted.steps,
      actions: formatted.actions,
      autoTools: formatted.autoTools,
    },
  };
}

function advanceWorkflow(session: AgentSession, message: string, ctx: AgentCtx): TurnResult {
  const wf = session.workflow;
  if (!wf) return cancelReply();
  const def = AGENT_WORKFLOWS.find((w) => w.id === wf.workflowId);
  if (!def) return cancelReply();

  let slots = session.reportSlots;
  const periodExtract = extractReportSlots(message, ctx.dataMaxIso);
  if (periodExtract.from) {
    slots = mergeReportSlots(slots, periodExtract);
  }

  const needsPeriod =
    def.id !== "first-setup" && missingReportSlots(slots).length > 0;
  if (needsPeriod) {
    const next = touch(session, { reportSlots: slots, missing: ["period"] });
    return {
      session: next,
      reply: {
        text: `Still need a period for **${def.title}**.\n${questionForMissing(["period"])}`,
        actions: chipsToActions(["period"]),
        autoTools: [],
      },
    };
  }

  const isNext =
    /^(next|continue|yes|ok|okay|go|proceed)[\s!.]*$/i.test(message.trim());

  // Period just supplied while we were waiting → run step 0
  const wasWaitingPeriod = session.missing.includes("period");
  let nextIndex = wf.stepIndex;
  if (wasWaitingPeriod && periodExtract.from) {
    nextIndex = 0;
  } else if (isNext) {
    if (wf.stepIndex >= def.steps.length - 1) {
      return {
        session: null,
        reply: {
          text: `**${def.title}** complete. Ask me to dig into any screen, enter data, or copy a share link anytime.`,
          actions: [
            { id: "again", label: "Run pack again", kind: "chip", chipText: def.title },
          ],
          autoTools: [],
        },
      };
    }
    nextIndex = wf.stepIndex + 1;
  }

  const periodLabel =
    slots.periodLabel ||
    (slots.from && slots.to ? `${slots.from} → ${slots.to}` : "scoped period");
  const next = touch(session, {
    reportSlots: slots,
    missing: [],
    notes: [],
    workflow: { ...wf, stepIndex: nextIndex },
    status: "collecting",
  });
  const formatted = formatWorkflowStep(def, nextIndex, slots, periodLabel);
  return {
    session: next,
    reply: {
      text: formatted.text,
      steps: formatted.steps,
      actions: formatted.actions,
      autoTools: formatted.autoTools,
    },
  };
}

function handleHowto(
  text: string,
  ctx: AgentCtx,
  events: Event[],
  persona: RoleId,
): TurnResult {
  // If execute language slipped through, don't only show links
  if (hasExecuteLanguage(text)) {
    const session = newSession("enter_data", "collecting");
    const extracted = extractEntrySlots(text, ctx.todayIso);
    return advanceEntry(
      session,
      extracted,
      ctx,
      "I'll enter this for you — need a few fields first.",
    );
  }

  const guide = resolveGuide(text, {
    events,
    persona,
    dataMaxIso: ctx.dataMaxIso,
    currentPath: ctx.currentPath,
  });

  if (!isGuideFallback(guide) && guide.text) {
    const actions: AgentAction[] = guide.actions.map((a, i) => {
      const spot = a.href ? spotlightNavFromHref(a.href) : null;
      return {
        id: `nav-${i}`,
        label: a.label,
        kind: "navigate" as const,
        href: a.href,
        navKey: a.navKey,
        state: a.state,
        spotlightNav: spot ?? undefined,
      };
    });
    const autoTools: ToolIntent[] = [];
    for (const a of guide.actions) {
      if (!a.auto) continue;
      autoTools.push({
        type: "navigate",
        href: a.href,
        state: a.state,
        label: a.label,
      });
      const spot = spotlightNavFromHref(a.href);
      if (spot) autoTools.push({ type: "spotlight", navKey: spot });
    }
    const tip = contextTips({
      eventCount: ctx.eventCount ?? events.length,
      currentPath: ctx.currentPath,
      persona: ctx.persona,
      canWrite: ctx.canWrite,
    });
    return {
      session: null,
      reply: {
        text: (tip ? tip + "\n\n" : "") + guide.text,
        steps: guide.steps,
        actions,
        autoTools,
      },
    };
  }

  const tip = contextTips({
    eventCount: ctx.eventCount ?? events.length,
    currentPath: ctx.currentPath,
    persona: ctx.persona,
    canWrite: ctx.canWrite,
  });
  return {
    session: null,
    reply: {
      text:
        (tip ? tip + "\n\n" : "") +
        "I can **enter data**, **run a GM pack**, **summarize a period**, **open Reports**, or walk you through any screen.\n\n" +
        "Try:\n• “enter assembly checked 400 accepted 390 coag 5 sd 3 bl 2”\n" +
        "• “Monday GM review”\n• “summarize july first week report”\n• “how do I import Excel?”",
      actions: [],
      autoTools: [],
    },
  };
}

/**
 * Main entry: pure reducer. Client runs `reply.autoTools` and confirm_ingest.
 */
export function runTurn(
  session: AgentSession | null,
  message: string,
  ctx: AgentCtx,
  events: Event[] = [],
  persona: RoleId = "gm",
): TurnResult {
  const text = message.trim();
  if (!text) {
    return {
      session,
      reply: { text: "Say what you need — enter data, summarize, or how to use a screen.", actions: [], autoTools: [] },
    };
  }

  if (isCancelMessage(text)) {
    clearSession();
    return cancelReply();
  }

  // ── Active task: confirming ──────────────────────────────────────────
  if (session && session.status === "confirming") {
    if (isConfirmMessage(text) || /\bconfirm\b/i.test(text)) {
      if (session.kind === "enter_data" && session.draft?.kind === "enter_data") {
        if (!ctx.canWrite) {
          return {
            session,
            reply: formatEntryConfirm(session, false),
          };
        }
        return {
          session: touch(session, { status: "executing" }),
          reply: {
            text: "Saving to the ledger…",
            actions: [],
            autoTools: [{ type: "ingest", draft: session.draft }],
            draft: session.draft,
          },
        };
      }
    }
    // Treat as slot edits while confirming
    if (session.kind === "enter_data") {
      const extracted = extractEntrySlots(text, ctx.todayIso);
      return advanceEntry(session, extracted, ctx);
    }
    if (session.kind === "report" || session.kind === "analyze") {
      const extracted = extractReportSlots(text, ctx.dataMaxIso);
      return advanceReport(session, extracted, session.kind, text);
    }
  }

  // ── Active task: collecting ──────────────────────────────────────────
  if (session && session.status === "collecting") {
    if (session.kind === "workflow") {
      return advanceWorkflow(session, text, ctx);
    }
    if (session.kind === "enter_data") {
      const extracted = extractEntrySlots(text, ctx.todayIso);
      return advanceEntry(session, extracted, ctx);
    }
    if (session.kind === "report" || session.kind === "analyze") {
      const extracted = extractReportSlots(text, ctx.dataMaxIso);
      return advanceReport(session, extracted, session.kind, text);
    }
  }

  // ── New task ─────────────────────────────────────────────────────────
  // Explicit workflow match even if classify says howto
  if (matchWorkflow(text) || classifyTaskKind(text) === "workflow") {
    return startWorkflow(text, ctx);
  }

  const kind = classifyTaskKind(text);

  if (kind === "enter_data") {
    const session0 = newSession("enter_data", "collecting");
    const extracted = extractEntrySlots(text, ctx.todayIso);
    const preamble = hasExecuteLanguage(text) || /\bhow do i enter\b/i.test(text)
      ? "I'll enter this for you (same path as Data Entry). Confirm before anything is saved."
      : "I'll prepare a Data Entry draft from what you said.";
    return advanceEntry(session0, extracted, ctx, preamble);
  }

  if (kind === "report" || kind === "analyze") {
    const session0 = newSession(kind, "collecting");
    const extracted = extractReportSlots(text, ctx.dataMaxIso);
    return advanceReport(session0, extracted, kind, text);
  }

  if (kind === "navigate") {
    const guide = resolveGuide(text, {
      events,
      persona,
      dataMaxIso: ctx.dataMaxIso,
      currentPath: ctx.currentPath,
    });
    const actions: AgentAction[] = guide.actions.map((a, i) => ({
      id: `nav-${i}`,
      label: a.label,
      kind: "navigate" as const,
      href: a.href,
      state: a.state,
    }));
    const autoTools: ToolIntent[] = guide.actions
      .filter((a) => a.auto)
      .map((a) => ({
        type: "navigate" as const,
        href: a.href,
        state: a.state,
        label: a.label,
      }));
    return {
      session: null,
      reply: {
        text: guide.text || "Opening that screen.",
        steps: guide.steps,
        actions,
        autoTools,
      },
    };
  }

  if (kind === "explain") return formatExplainReply(ctx);
  if (kind === "export") return formatExportReply(ctx);

  return handleHowto(text, ctx, events, persona);
}

/** After successful ingest — clear session + success copy. */
export function turnAfterIngestSuccess(draft: import("./types").EntryDraft): TurnResult {
  const s = draft.slots;
  return {
    session: null,
    reply: {
      text:
        `**Saved** to the ledger.\n\n` +
        `• ${s.macro} · ${s.processName}\n` +
        `• Batch **${s.batchId}** · ${s.size} · ${s.date}\n` +
        `• Checked **${s.checked}** · Accepted **${s.acceptedGood ?? 0}** · Rejected **${s.rejected ?? defectSum(s.defects)}**\n\n` +
        `Dashboard and analysis will include this row.`,
      actions: [
        { id: "entry", label: "Open Data Entry", kind: "navigate", href: "/data-entry" },
        { id: "audit", label: "Open Audit Trail", kind: "navigate", href: "/audit" },
        { id: "again", label: "Enter another", kind: "chip", chipText: "enter assembly data" },
      ],
      autoTools: [],
    },
  };
}

export function turnAfterIngestFailure(message: string, session: AgentSession | null): TurnResult {
  return {
    session: session ? touch(session, { status: "confirming" }) : null,
    reply: {
      text: `Could not save: ${message}\n\nYou can fix the draft and confirm again, or open Data Entry.`,
      actions: [
        { id: "confirm", label: "Retry Confirm", kind: "confirm_ingest" },
        { id: "entry", label: "Open Data Entry", kind: "navigate", href: "/data-entry" },
        { id: "cancel", label: "Cancel", kind: "cancel", chipText: "cancel" },
      ],
      autoTools: [],
      draft: session?.draft,
    },
  };
}

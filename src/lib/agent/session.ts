import type { AgentSession, EntrySlots, ReportSlots, TaskKind, TaskStatus } from "./types";

import { z } from "zod";
import { slot } from "@/lib/storage";

const sessionSlot = slot({
  name: "agent-session",
  area: "session",
  schema: z.looseObject({ taskId: z.string(), kind: z.string(), status: z.string() }) as unknown as z.ZodType<AgentSession>,
  legacyKeys: ["moid_agent_session_v1"],
});

export function newSession(kind: TaskKind, status: TaskStatus = "collecting"): AgentSession {
  const now = new Date().toISOString();
  return {
    taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind,
    status,
    entrySlots: {},
    reportSlots: {},
    missing: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
    validationError: null,
  };
}

export function touch(session: AgentSession, patch: Partial<AgentSession>): AgentSession {
  return {
    ...session,
    ...patch,
    entrySlots: patch.entrySlots
      ? { ...session.entrySlots, ...patch.entrySlots }
      : session.entrySlots,
    reportSlots: patch.reportSlots
      ? { ...session.reportSlots, ...patch.reportSlots }
      : session.reportSlots,
    updatedAt: new Date().toISOString(),
  };
}

export function mergeEntrySlots(base: EntrySlots, next: EntrySlots): EntrySlots {
  const defects =
    next.defects || base.defects
      ? { ...(base.defects ?? {}), ...(next.defects ?? {}) }
      : undefined;
  return {
    ...base,
    ...next,
    defects,
  };
}

export function mergeReportSlots(base: ReportSlots, next: ReportSlots): ReportSlots {
  return { ...base, ...next };
}

export function loadSession(): AgentSession | null {
  if (typeof window === "undefined") return null;
  return sessionSlot.get() ?? null;
}

export function saveSession(session: AgentSession | null): void {
  if (typeof window === "undefined") return;
  if (!session || session.status === "done" || session.status === "idle") sessionSlot.remove();
  else sessionSlot.set(session); // quota: the conversation just won't survive a reload
}

export function clearSession(): null {
  sessionSlot.remove();
  return null;
}

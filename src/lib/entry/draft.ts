// Draft cache for in-progress data entry. Keeps typed-but-unsaved values across
// navigation/reload so an operator never loses a half-filled form. This is NOT
// a save — nothing reaches the ledger until the operator submits.
// ponytail: browser storage, per-browser. Move server-side if drafts must follow a
// user between devices.

import { z } from "zod";
import { slot } from "@/lib/storage";

// A draft is whatever object the form wrote; the form re-checks each field it
// reads, so only "is an object" is asserted here.
const draftSchema = z.record(z.string(), z.unknown());

/** `key` is the caller's old localStorage key; it doubles as the legacy key to adopt. */
const draftSlot = (key: string) =>
  slot({ name: `draft:${key.replace(/^moid_/, "")}`, schema: draftSchema, legacyKeys: [key] });

export function loadDraft<T>(key: string): T | null {
  return (draftSlot(key).get() as T | undefined) ?? null;
}

export function saveDraft(key: string, value: unknown) {
  const s = draftSlot(key);
  if (value == null) s.remove();
  else s.set(value as Record<string, unknown>); // best-effort: quota / private mode just means no draft
}

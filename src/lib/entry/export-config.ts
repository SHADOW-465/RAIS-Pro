// What the topbar "Export" button does on Data Entry.
// Stored per-browser (localStorage) so plant IT can set defaults without a deploy.

import { z } from "zod";
import { slot } from "@/lib/storage";

export type DataEntryExportMode = "entry-transfer" | "audit-zip";
export type EntryExportChannel = "direct-entry" | "all";

export interface DataEntryExportConfig {
  /**
   * entry-transfer — JSON package for Staging import / DB→DB moves (default).
   * audit-zip — legacy full ALCOA+ audit package (CSV + manifest zip).
   */
  mode: DataEntryExportMode;
  /** Which ledger rows go into the transfer package. */
  channel: EntryExportChannel;
  /**
   * When true, Export uses the current topbar date range (Sources / period).
   * When false, uses optional fixed from/to below (empty = all dates).
   */
  useDateScope: boolean;
  /** ISO yyyy-mm-dd inclusive, only if useDateScope is false. */
  from: string;
  to: string;
}


export const DEFAULT_DATA_ENTRY_EXPORT_CONFIG: DataEntryExportConfig = {
  mode: "entry-transfer",
  channel: "direct-entry",
  useDateScope: false,
  from: "",
  to: "",
};

// A damaged field falls back to its default; a value that is not an object at
// all fails the schema and the slot discards it.
const exportConfigSlot = slot({
  name: "data-entry-export",
  schema: z.object({
    mode: z.enum(["audit-zip", "entry-transfer"]).catch(DEFAULT_DATA_ENTRY_EXPORT_CONFIG.mode),
    channel: z.enum(["all", "direct-entry"]).catch(DEFAULT_DATA_ENTRY_EXPORT_CONFIG.channel),
    useDateScope: z.boolean().catch(false),
    from: z.string().catch(""),
    to: z.string().catch(""),
  }) as z.ZodType<DataEntryExportConfig>,
  legacyKeys: ["moid_data_entry_export"],
});

export function readDataEntryExportConfig(): DataEntryExportConfig {
  return exportConfigSlot.get() ?? { ...DEFAULT_DATA_ENTRY_EXPORT_CONFIG };
}

export function writeDataEntryExportConfig(cfg: DataEntryExportConfig): void {
  exportConfigSlot.set(cfg); // quota / private mode: the config just won't persist
}

export function describeDataEntryExportConfig(cfg: DataEntryExportConfig): string {
  if (cfg.mode === "audit-zip") {
    return "Full audit ZIP (CSV extracts + hash manifest)";
  }
  const ch =
    cfg.channel === "all" ? "all ledger events" : "Data Entry rows only";
  const dates = cfg.useDateScope
    ? "current topbar date range"
    : cfg.from || cfg.to
      ? `${cfg.from || "…"} → ${cfg.to || "…"}`
      : "all dates";
  return `Transfer JSON · ${ch} · ${dates}`;
}

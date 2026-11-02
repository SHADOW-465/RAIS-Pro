// Per-browser interface preferences (layout choices, collapsed panels, the last
// operator typed). Nothing here is business data: losing it costs a click, so
// every slot is an ordinary lib/storage.ts value that is dropped when stale.
// `legacyKeys` carry across what the pre-wrapper code saved under moid_* / rais_*.

import { z } from "zod";
import { slot } from "@/lib/storage";

const gridLayout = z.enum(["2-wide", "1-full", "3-grid", "4-compact"]);
export type GridLayout = z.infer<typeof gridLayout>;

export const defectGridLayout = slot({ name: "defect-grid-layout", schema: gridLayout, legacyKeys: ["rais_defect_grid_layout"] });
export const stageGridLayout = slot({ name: "stage-grid-layout", schema: gridLayout, legacyKeys: ["rais_stage_grid_layout"] });

export const sidebarCollapsed = slot({ name: "sidebar-collapsed", schema: z.boolean(), legacyKeys: ["rais_sidebar_collapsed"] });
export const navSectionsCollapsed = slot({
  name: "nav-collapsed",
  schema: z.record(z.string(), z.boolean()),
  legacyKeys: ["moid_nav_collapsed"],
});

export const schemaTreeOpen = slot({ name: "schema-tree-open", schema: z.array(z.string()), legacyKeys: ["moid_schema_tree_open"] });
/** Unlocking Data Schema editing lasts for the tab only. */
export const schemaEditUnlocked = slot({
  name: "schema-edit-unlocked",
  schema: z.literal(true),
  area: "session",
  legacyKeys: ["moid_schema_edit_unlocked"],
});

export const workbooksOrder = slot({ name: "workbooks-order", schema: z.array(z.string()), legacyKeys: ["moid_workbooks_order"] });

export const entryHeaderOperator = slot({ name: "entry-hdr-operator", schema: z.string(), legacyKeys: ["rais_hdr_operator"] });
export const entryHeaderShift = slot({ name: "entry-hdr-shift", schema: z.string(), legacyKeys: ["rais_hdr_shift"] });
export const entryProductType = slot({ name: "entry-product-type", schema: z.string(), legacyKeys: ["moid_product_type"] });

export const theme = slot({ name: "theme", schema: z.enum(["light", "dark"]), legacyKeys: ["theme"] });
export const showCalendarHolidaysPref = slot({
  name: "show-calendar-holidays",
  schema: z.boolean(),
  legacyKeys: ["showCalendarHolidays"],
});

export const customDefects = slot({
  name: "custom-defects",
  schema: z.array(z.object({ code: z.string(), label: z.string(), aliases: z.string() })),
  legacyKeys: ["rais_custom_defects"],
});

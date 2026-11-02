# MOID (RAIS Pro): UI/UX redesign plan, simple at a glance with more detail one tap away

Prepared 3 Nov 2026 (IST). This was a read-only audit: no code changes, commits or pushes.
Client: a Delhi medical-device manufacturer.
Design rules come from `/workspace/ai_chat_ux_principles.md`. The model is Samsung SmartThings: each screen shows a few tiles you can read at a glance, and tapping a tile opens more detail.

## 0. Source and an important note
- I audited branch `fix/production-hardening` @ `48cc6f8`, cloned from GitHub `SHADOW-465/RAIS-Pro`. Pages are under `src/app/(plant)/*`.
- **Check this before building:** at audit time, GitHub `main` was **`241d3e4`** ("feat: batch conversion fixes, COPQ calculation rectification, and UI improvements", 2 Nov 2026 16:37 IST). Its parent is `b4d8734`, so it does **not** contain `48cc6f8`. The local PC repo had `main` = `241d3e4` too. Its checked-out branch was `feat/impeccable-ui-redesign` @ `eabcbdf`, 44 commits ahead of main, with an uncommitted change to `src/app/layout.tsx`. So someone is already doing a separate "impeccable" UI redesign, and the hardening merge may not be live. Reconcile both before starting this plan.
- Page sizes (lines): Audit 3078, Schema 1930, Dashboard 1528, Batch Conversion 1374, Settings 985, Staging 934, CAPA 910, Open Lots 799, Defect 746, Stage 609, Remedies 597, Workbooks 565, SPC 454, Alerts 444, Size 340, Hold 270, Data Entry 236, Process Flow 220, COPQ 204, Reports 43 (wraps ReportsWorkspace 813). Shared: AppShell 2681, FloatingDetailModal 3103, widgets 2543, BatchMatrixEntry 1961, EntryHistory 1624, SourcesScopePanel 1503.

## 1. Inventory

### 1a. Roles (src/lib/persona.ts, roles also in DB `plant_roles`)
| Role | Home | Sees | Can |
|---|---|---|---|
| GM | `/` | everything (21 destinations) | write, approve, configure, erase ledger |
| Owner | `/` | Dashboard, all 8 analysis pages, Reports, CAPA, Remedies, Alerts, Ask MOID | view only |
| Data Entry Operator | `/data-entry` | Data pages, all analysis pages, Reports, CAPA, Remedies, Alerts, Ask, Audit (not Schema or Settings) | write, no approve or config |
| Custom roles | from DB | as set in Settings > Roles & access | as set (unknown role sees nothing) |
Purge and schema-reset tools show only for users listed in `MOID_ADMIN_USERS`.

### 1b. Global shell (AppShell, on every page)
- Sidebar has 4 collapsible groups. **Overview:** Dashboard. **Your data:** Data Entry, Batch Conversion, Import from Excel, Excel Data. **Analysis:** By Stage, By Size, By Defect, Hold Quantity, Open Lots, SPC, Process Flow, Cost of Rejection. **Management:** Reports, CAPA, Remedies, Alerts, Ask MOID, Audit Trail, Plant Schema, Settings. The sidebar itself can collapse.
- Top bar:
  - "View" chip: factory overview, or pin a station.
  - Sources panel: sections, batches, Excel files, All uploads, Full plant, Plant default.
  - Date preset and range, and grain (day/week/month/FY), which is auto-suggested.
  - Calendar holidays toggle.
  - Command palette (Jump).
  - Notifications panel, with ack/approve/deny and expand.
  - Persona switcher.
  - Ask MOID chat widget. Its placeholder is "Enter data… / Summarize report… / How do I…", with suggestion chips and agent action buttons.
- Background pieces: BuildWatcher (new-version banner), LedgerWatcher (60 s refresh), SharedStateBanner, ErrorScreen, PageLoader.

### 1c. Pages (controls found in code)
- **Dashboard `/`:**
  - QualityStatusStrip, FunnelStrip (Production Funnel), OpenWipStrip.
  - KPI tiles: Total, Worst gate, Worst size, Top defect.
  - Charts: Rejection Trend, Rejection by Stage, Rejection by Size, Top Defects (Pareto), Stage × Size Concentration.
  - AI Diagnostics & Actionable Brief, with per-recommendation "Create CAPA" (CapaComposerModal).
  - Audit & Verification table; DashboardBoard (Change layout / Fix layout / Reset / move tiles up, down, left, right); ChartBuilder; FloatingDetailModal drill-down; "go to staging" link.
- **Data Entry:** tabs "Log a batch" (BatchMatrixEntry: batch ID zone, quantity reconciliation, defect workspace, sticky save bar, exception modal, ledger receipt) and "History" (EntryHistory: ledger filter all/pending/synced, group by ledger, edit, reuse, revision history). Also a success message with dismiss.
- **Batch Conversion:** tabs "Log batches" and "Converted history". Has ConversionEntryPanel; original batch ID, quantity changed, conversion note, mirrored entry; lineage/audit panel (source vs converted, reveal panel); undo conversion with confirm; date picker; and the same BatchMatrixEntry and EntryHistory as Data Entry.
- **Import from Excel `/staging`:**
  - Steps rail: Upload plant Excel (UploadZone), Transfer package, Quick stats, How import works, Data quality (Outlier, Missing, Logical, Formula checks), Commit to ledger.
  - MappingVerificationPanel and ExcelTabs.
  - Staging grid: jump to the next or previous invalid row, swap Checked↔Rejected, flags expand, row comments, paging.
  - Links to Dashboard and Data Entry.
- **Excel Data `/workbooks`:** Files list (drag to reorder, delete workbook), ExcelTabs, Rejection rate trend, Top defects, By stage, ChartBuilder, drill-down modal.
- **By Stage:** Stage Contribution, Rejection Share by Stage, Process Flow Quality Gates, line charts, layout switcher (1-full / 2-wide / 3-grid / 4-compact), drill-down modal.
- **By Size:** line charts, Size × Defect heatmap, Size colour code, size Select, drill-down modal.
- **By Defect:** Pareto, line charts, qty vs rate toggle, the same layout switcher (4 options), drill-down modal.
- **Hold Quantity:** HOLD share, HOLD by station, line chart, "Filter lots".
- **Open Lots:** filter chips (Stalled 3+ days, Not complete, Line complete, Complete); group-by; Complete vs waiting chart; process complete/not complete; "View only Batch IDs (Option 1)" vs "View Data Entry History (Option 2)"; "Filter lots"; drill-down modal.
- **SPC:** X-bar chart, Zoom in, Zoom out, Fit viewport, Control limits, Western Electric rules, SPC interpretation & recommended actions, Status/Rate, drill-down modal.
- **Process Flow:** FBC process flow (DS/ANX/02:00), process stages, critical-operation markers, drill-down modal.
- **Cost of Rejection `/copq`:** gauge, trend line, Savings Opportunity Summary, drill-down modal.
- **Reports:** ReportsWorkspace with report type, period (financial year / custom), batch and Excel file pickers, presets load/save/save-as-copy/delete, evidence manifest, mobile tabs, preview (ReportDocument / AuditReportDocument / ForensicBook), print and download.
- **CAPA:** Decision engine (open recommendations, reload, create from a recommendation), CAPA register (search, filter, status Open / In Progress / Completed and a cycle-status button, priority High / Medium / Low), New CAPA, edit, save, cancel, delete with confirm, date picker, CapaComposerModal.
- **Defect Remedies:** find defect, DefectRemedyShowcase, tabs, trend kind (spike/dip), save feed, trend notes (save, remove), open a defect.
- **Alerts:** search, period buckets and clear, date picker, AlertCards with approve/deny.
- **Audit Trail:**
  - Views: By batch / By upload.
  - Filters: all sources, types, stages, sizes, event types, categories, status (In progress / Complete), source (Excel / Data entry), 2-way.
  - Six sort options, date picker, paging.
  - RawTable, stages grouped by process, edit history (EntryRevisionHistory), erase entry, dismiss.
- **Plant Schema:**
  - Tabs: Stages, Sizes, Defect codes, All mappings.
  - Search, integrity issues panel, per-file interpretation, "No master schema" state, show mappings, add, edit, save, delete, cancel.
  - Delete cluster and delete workbook.
  - SchemaTree, SchemaDetail, SchemaEditUnlock.
- **Settings:** sections are Shift windows, Roles & access, Plant users, Display defaults, Defect registry (with snapshot), Custom codes (add/remove), Calculation rules (also at `/settings/rules`), Data Entry export (Data Entry only / all ledger events), and Administrative (purge transaction data, clear schema; admin users only).

## 2. Repeated features found (consolidation list)
1. **Data Entry and Batch Conversion** both embed the full BatchMatrixEntry and EntryHistory → one "Log & history" workspace. Conversion becomes a mode or action on a batch, not a second copy of the form.
2. **Drill-down modal (FloatingDetailModal)** is used on 9 pages, and each page also has its own filters next to it → one standard side drawer ("Details") with the same tabs everywhere (Batches / History / Spreadsheet / Source).
3. **Layout switcher (1/2/3/4 columns)** on By Stage and By Defect, plus DashboardBoard layout editing → remove it from the analysis pages and keep one fixed responsive grid. Layout editing stays on the Dashboard only, under "Customise".
4. **Stage views are split across 4 places:** By Stage (Process Flow Quality Gates), Process Flow, Dashboard Funnel/Rejection by Stage, and Hold by station → one "Stages" page, with Flow as a tab.
5. **Lot status is split across 3 places:** Open Lots, Hold Quantity, Dashboard OpenWipStrip → one "Lots" page with Open / Hold / Stalled / Complete tabs. The strip stays only as a dashboard tile.
6. **Excel is split across 3 places:** Import from Excel, Excel Data (workbooks), and the Sources panel (files) → one "Excel files" area: Import, then files list, then file detail.
7. **ChartBuilder** on both Dashboard and Workbooks → keep it on one "Custom chart" button inside the drawer or Reports.
8. **CAPA creation** from Dashboard brief, CAPA decision engine, Remedies, and Alerts context → one CapaComposer opened from everywhere (already shared, so keep it). Remove the duplicate "recommendations" lists: the Dashboard brief and the CAPA Decision engine show the same thing.
9. **Alerts page vs Notifications panel:** both list alerts with approve/deny → the panel holds the inbox, and the Alerts page becomes its "See all history" view.
10. **Defect lists:** Plant Schema > Defect codes, Settings > Defect registry, and Settings > Custom codes → one "Defects" list inside Plant setup.
11. **Date and scope controls:** the global top-bar date/grain/Sources plus page-level DatePickers (Audit, Alerts, Batch Conversion, CAPA, Reports) and Open Lots/Hold "Filter lots" → one global scope bar. Pages add only a Filters popover for what is specific to them.
12. **Export, print and download** in AppShell, Reports, ShiftQueueTable, EntryExportPanel, ChartBuilder and Settings export → one Export menu (CSV / Excel / PDF) on any table or chart. Full report packs stay in Reports.
13. **Audit Trail "edit history"** and Data Entry History "revision history" are the same EntryRevisionHistory → one "History" drawer tab.
14. **Ask MOID** has three entry points: sidebar item, chat widget, and command palette → one Ask button in the top bar.

## 3. Global redesign

### 3a. Navigation: 21 items → 4 groups and 9 destinations
| New | Contains (old pages) |
|---|---|
| **Home** | Dashboard |
| **Log** | Data Entry, Batch Conversion (as a mode), entry History |
| **Excel files** | Import from Excel, Excel Data |
| **Quality** (one page, tabs) | By Stage + Process Flow (tab "Flow"), By Size, By Defect, SPC |
| **Lots** | Open Lots, Hold Quantity |
| **Cost** | Cost of Rejection |
| **Actions** | CAPA, Defect Remedies (tab), Alerts history (tab) |
| **Reports** | Reports, Audit Trail (tab "Audit trail") |
| **Plant setup** (GM only) | Plant Schema, Settings (all sections), Calculation rules |
Ask MOID moves to a top-bar button. Old URLs redirect to the new tabs, so bookmarks still work.

### 3b. Top bar (the same on every page)
- Left: page title.
- Middle: one **Scope** chip that combines date range, grain and Sources/View into a popover, with a one-line summary such as "Oct 2026 · All lines · Excel + entry". Holidays toggle moves into that popover.
- Right: Ask, Notifications (bell with a count), Jump (⌘K), and the user menu (role switch, theme).

### 3c. Shared components (build once, use everywhere)
- `KpiTile`: label, value in Geist Mono, change from the last period, status icon and text. Tap it to open the drawer.
- `DetailDrawer`: replaces FloatingDetailModal. Opens on the right with tabs Summary / Batches / History / Spreadsheet / Source, plus Export.
- `FiltersPopover`: one button showing a count, e.g. "Filters (2)".
- `DataTable`: shadcn table with expandable rows, sort in the column header, an Export menu and paging. Used by Audit, Lots, CAPA, History and Staging.
- `ChartCard`: title, one-line takeaway, chart, and a "Details" link that opens the drawer.
- `StatusBadge`: icon plus text; colour is never the only signal.
- `PrimaryAction`: one accent button per screen, everything else neutral or ghost.
- `EmptyState`, `ConfirmDialog` (already exists), and `AskChips`.

### 3d. Design tokens
- Base: zinc neutrals for background, card, border and muted-foreground. One accent (pick one from the current brand). Status colours (red, amber, green) are used only with an icon and a word.
- Type: Geist Sans for text, Geist Mono for numbers, IDs and dates. Sizes 12/14/16/24/40. **Weights 400/500/600 only.** The code now uses 700 (391 times), 800 (77), 650 (3) and 550 (2), so all of these move to 600.
- Spacing: 4/8/12/16/24/32/48/64. Compact density (gap-4/p-4) on Home, Quality and Lots; comfortable (gap-6/p-6) on forms (Log, Plant setup).
- Radius 0.625rem everywhere. Icons: Lucide at 16/20 px with text labels. Text blocks max-width 70ch, line-height 1.5.
- Remove hard-coded hex values: Dashboard has 7, Audit 3, Size 2, and Batch Conversion, Schema and Settings 1 each.

### 3e. Role differences
- **GM:** everything, including Plant setup. The primary action on Home is "Review alerts" or "Create CAPA", depending on state.
- **Owner:** the same Home and Quality pages, view only. Primary action buttons are hidden; Export stays. No Log, Excel or Plant setup.
- **Operator:** home is **Log**. Its Home shows only "Today's entries, pending sync, open lots". Quality, Lots and Reports are read-only. No Plant setup.
- Custom roles keep using the `navAllow` keys, mapped to the new destinations.

### 3f. Ask MOID
- Replace the placeholder with "Ask about rejections, lots or entries".
- Show 4 starter chips based on the data, for example:
  - "Why did rejections rise this week?"
  - "Which stage is worst this month?"
  - "Which lots are stalled?"
  - "Draft a CAPA for the top defect"
- Answers come short first, with "Show details" to expand.

## 4. Per-page plans
For each page: **L1** = at a glance (3-5 numbers + one primary action), **L2** = one tap deeper, **L3** = full detail.

### Home (Dashboard)
Purpose: is the plant OK today, and what needs action?
- **L1:** Rejection rate (with change), Worst gate, Worst size, Top defect, Open lots stalled. Primary action: **Review issues** (opens the AI brief, which has Create CAPA).
- **L2:**
  - Rejection trend card.
  - 3 compact cards: by stage, by size, by defect.
  - AI brief, collapsed to 3 bullets.
  - Each tile opens the DetailDrawer.
- **L3:** the drawer (batches, history, spreadsheet, source), the Stage × Size heatmap and the Audit & Verification table (tab "Data checks").
| Feature | Lands |
|---|---|
| KPI Total / Worst gate / Worst size / Top defect | L1 |
| QualityStatusStrip | L1, as the status line above the tiles |
| OpenWipStrip | L1 tile "Stalled lots" → Lots |
| FunnelStrip | L2 card → Quality > Flow |
| Rejection Trend | L2 |
| By Stage / By Size / Pareto charts | L2, as compact cards linking to Quality tabs |
| Stage × Size concentration | L3, in the drawer and Quality > Size |
| AI Diagnostics brief | L2 (collapsed); full text L3 |
| Create CAPA from recommendation | L1 primary action path / L2 |
| Audit & Verification table | L3, in the "Data checks" tab |
| DashboardBoard layout edit/reset/move | L3, "Customise" in the page menu (GM only) |
| ChartBuilder | moved to Reports > Custom chart |
| FloatingDetailModal | replaced by DetailDrawer (L3) |
| Go to staging link | in the empty state only |

### Log (Data Entry + Batch Conversion)
Purpose: record a batch, or change its lot/size, correctly the first time.
- **L1:** Today's entries, Pending sync, Last saved (time). Primary action: **Log a batch**.
- **L2:** the entry form: batch ID, quantities, defects, sticky Save. Use the "Convert this batch" action on a batch ID to open the conversion panel in the same form.
- **L3:** History table (expandable rows → revisions, reuse, edit), conversion lineage and undo, and the exception modal.
| Feature | Lands |
|---|---|
| Log a batch tab / BatchMatrixEntry (all zones, save bar, receipt) | L2 |
| Data Entry History (filters all/pending/synced, group by ledger, edit, reuse) | L3 "History" tab; filters go in the Filters popover |
| Revision history | L3, History drawer tab |
| Success message | toast |
| Batch Conversion page / "Log batches" tab | merged into Log as the "Convert" action |
| Original batch ID, qty changed, note, mirrored entry, reason category | L2 conversion panel |
| Converted history | L3, History filter "Conversions" |
| Lineage/audit panel, source vs converted, undo + confirm | L3, batch drawer "Lineage" tab |
| Conversion date picker | inside the conversion panel |

### Excel files (Import + Excel Data)
Purpose: bring plant Excel in safely and see what each file contributed.
- **L1:** Files loaded, Rows waiting for review, Issues found. Primary action: **Upload Excel**.
- **L2:**
  - Import steps (Upload → Check → Commit) as a 3-step wizard. Data quality checks show as one summary with counts.
  - Files list.
- **L3:** the staging grid (jump between invalid rows, swap, comments, flags, paging), mapping verification, per-file tabs and charts, and transfer package.
| Feature | Lands |
|---|---|
| UploadZone | L1 primary |
| Transfer package | L3, an "Advanced" disclosure |
| Quick stats | L1 numbers |
| How import works | help popover (?) |
| Data quality (4 checks) | L2 summary; row details L3 |
| Commit to ledger | the wizard's final-step primary action |
| Staging grid tools | L3 |
| MappingVerificationPanel | L3 (step 2 "Check") |
| Workbooks files list, reorder, delete | L2 list; delete in the row menu |
| Per-file trend / top defects / by stage | L3 file drawer |
| ExcelTabs | L3 |
| ChartBuilder (workbooks) | moved to Reports > Custom chart |
| Links to Dashboard / Data Entry | removed (nav covers them) |

### Quality (By Stage, Process Flow, By Size, By Defect, SPC as tabs)
Purpose: where and why rejections happen.
- **L1 (per tab):** 3 numbers, e.g. worst item, its rate, change versus last period. Primary action: **See batches** (opens the drawer).
- **L2:** one main chart per tab, plus a ranked list with expandable rows.
- **L3:** the drawer, the full secondary charts and the Filters popover.
| Feature | Lands |
|---|---|
| Stage Contribution / Rejection Share by Stage | Stages tab L2 (one chart; toggle share/contribution) |
| Process Flow Quality Gates (stage page) | merged with the Process Flow page into the "Flow" tab |
| FBC flow diagram, stages, critical operations | Flow tab L2; doc code and notes L3 |
| Size line charts | Size tab L2 |
| Size × Defect heatmap | Size tab L3 |
| Size colour code | legend, L2 |
| Size Select | Filters popover |
| Pareto | Defects tab L2 |
| qty vs rate toggle | L2, a segmented control (also for stage and size) |
| Layout switcher 1/2/3/4 (Stage, Defect) | removed, one responsive grid |
| X-bar chart | SPC tab L2 |
| Zoom in, zoom out, fit viewport | L2, chart toolbar (icons with labels) |
| Control limits, Western Electric rules, interpretation | SPC L3, an expandable "How to read this" |
| Status/Rate | SPC L1 |
| FloatingDetailModal (each page) | DetailDrawer |

### Lots (Open Lots + Hold)
Purpose: what is stuck and what is on hold.
- **L1:** Open lots, Stalled 3+ days, On hold (qty), Completed this period. Primary action: **Show stalled lots**.
- **L2:** tabs Open / Stalled / Hold / Complete with a lots table (expandable rows → stages done and waiting).
- **L3:** Hold share and Hold by station charts, Complete vs waiting chart, and a lot drawer with the entry history.
| Feature | Lands |
|---|---|
| Filter chips (Stalled, Not complete, Line complete, Complete) | L2 tabs |
| Group-by | Filters popover |
| "View only Batch IDs (Option 1)" vs "View Data Entry History (Option 2)" | merged into one table with expandable rows (option 2 shows on expand) |
| Process complete chart, Complete vs waiting | L3 |
| Hold share, Hold by station, hold trend | Hold tab L2/L3 |
| "Filter lots" (2 pages) | one Filters popover |
| Dashboard OpenWipStrip | Home L1 tile linking here |

### Cost (COPQ)
Purpose: what rejections cost in rupees.
- **L1:** Cost this period, change versus last period, Biggest cost driver. Primary action: **See savings opportunities**.
- **L2:** the trend line and savings summary list.
- **L3:** the drawer with the breakdown by stage, size and defect, and how the cost is calculated (link to Plant setup > Calculation rules).
| Feature | Lands |
|---|---|
| Gauge | removed or replaced by the L1 number (one fewer chart; gauge kept as optional) |
| Trend line | L2 |
| Savings Opportunity Summary | L2 |
| Drill-down modal | L3 drawer |

### Actions (CAPA + Remedies + Alerts history)
Purpose: who is fixing what.
- **L1:** Open CAPAs, Overdue, High priority, Completed this month. Primary action: **New CAPA**.
- **L2:** CAPA register table (status and priority badges with text, search, Filters popover).
- **L3:** CAPA detail drawer (edit, cycle status, delete), suggested actions (former Decision engine), the Remedies tab and the Alerts history tab.
| Feature | Lands |
|---|---|
| New CAPA, CapaComposerModal | L1 primary |
| Register, search, filter, status/priority | L2 |
| Edit, save, cancel, cycle status, delete + confirm | L3 drawer |
| Decision engine, open/reload recommendations, create from recommendation | L3 "Suggested" panel (same source as the Home AI brief) |
| Date picker | in the CAPA form |
| Remedies page (find defect, showcase, tabs, spike/dip trend kind, save feed, notes) | Actions > Remedies tab; notes L3 |
| Alerts page (search, period buckets, date, approve/deny) | Actions > Alerts history tab; live inbox stays in the bell panel |

### Reports (+ Audit Trail)
Purpose: produce the pack the client needs, and prove where each number came from.
- **L1:** Last report generated, Saved presets, Open integrity issues. Primary action: **Create report**.
- **L2:** report type, then period, then a Preview step. Scope comes from the global Scope chip.
- **L3:** batch/file pickers, presets save/copy/delete, evidence manifest, print and download, Custom chart (from ChartBuilder), and the Audit trail tab.
Audit trail tab:
- L1: events this period, edits, erased.
- L2: table By batch / By upload.
- L3: all filters in one Filters popover; a sort menu with 6 options; row drawer with edit history and Erase (GM, with confirm); stages grouped by process; raw table.
| Feature | Lands |
|---|---|
| Report type, period FY/custom | L2 |
| Batch / Excel file pickers | L3 (default to global scope) |
| Presets load/save/copy/delete | L3 |
| Evidence manifest | L3 |
| Preview, print, download | L2 preview; print/download is the primary action on that step |
| Mobile tabs | kept (responsive) |
| Audit page: views, 10+ filter dropdowns, 6 sorts, paging, RawTable | Reports > Audit trail, L2/L3 |
| Edit history, erase entry | L3 row drawer |

### Plant setup (Plant Schema + Settings), GM only
Purpose: configure the plant once.
- **L1:** Stages, Sizes, Defect codes (counts), Integrity issues. Primary action: **Fix issues** if there are any, otherwise none.
- **L2:** a section list on the left: Stages & sizes, Defects, Mappings, Shifts, Users & roles, Display, Calculation rules, Export, Admin.
- **L3:** the editors (tree + detail, unlock to edit), per-file interpretation, and admin purge/reset (admin users only, inside a danger zone).
| Feature | Lands |
|---|---|
| Schema tabs Stages / Sizes / Defect codes / All mappings | L2 sections |
| Search schema | L2 header |
| Integrity issues panel | L1 number → L2 list |
| Per-file interpretation, show mappings | L3 under Mappings |
| Add/edit/save/delete, delete cluster/workbook, SchemaEditUnlock | L3 |
| Settings: Defect registry + Custom codes | merged into "Defects" |
| Shift windows, Roles & access, Plant users, Display defaults | L2 sections |
| Calculation rules (+ `/settings/rules`) | one section; route redirects |
| Data Entry export | Export section (and the Export menu on tables) |
| Purge transaction data, clear schema | Admin danger zone (`MOID_ADMIN_USERS` only) |

### Ask MOID (top-bar panel)
- **L1:** 4 data-based chips.
- **L2:** a short answer.
- **L3:** "Show details" with sources and agent actions (e.g. Create CAPA, open a page).
The sidebar item and the chat widget are merged into this one button; the command palette keeps an "Ask…" entry.

## 5. Build order (small phases you can ship and test)
Rules for every phase: on a branch, `tsc`, jest and build pass; Vercel preview click-through with screenshots; no data writes except on a TEST batch, removed afterwards; push only with OK.
1. **Tokens only.** Geist fonts, zinc base and one accent, weights capped at 600, spacing and radius tokens, hex values removed. No layout change. Test: visual diff screenshots of every page.
2. **Shared components.** KpiTile, StatusBadge, PrimaryAction, FiltersPopover, DataTable, DetailDrawer (wrapping the existing modal data first). Test: unit tests and a Storybook-like demo route (dev only).
3. **Top bar.** One Scope chip (date, grain, sources, view, holidays), and Ask, bell, Jump and user menu on the right. Page-level DatePickers read the global scope. Test: the same numbers before and after for 3 date ranges.
4. **Navigation regroup with redirects.** New 9 destinations; old pages mounted as tabs without changing their content yet. Test: every old URL redirects; role menus correct for GM, Owner and Operator.
5. **Home.** L1/L2/L3, AI brief collapsed, layout editing under Customise. Test: KPI values match the old dashboard.
6. **Quality tabs.** Merge Stage and Process Flow; remove the layout switchers; drawer everywhere.
7. **Lots.** Merge Open Lots and Hold into tabs and one table.
8. **Log.** Data Entry and Batch Conversion share one form, with Convert as an action. Highest risk, so test on a TEST batch: log, convert, undo, check history and lineage. Remove the test rows afterwards.
9. **Excel files.** Upload → Check → Commit wizard, then the files list.
10. **Actions.** CAPA, Remedies and Alerts history; one recommendations source.
11. **Reports + Audit trail tab.** Filters popover, row drawer.
12. **Plant setup.** Schema and Settings merged; Defects merged.
13. **Ask MOID chips** and the short-answer-first layout.
14. **Clean-up.** Delete dead components (layout switcher, old modal, duplicate filters); final duplicate-feature audit against section 2.

## 6. Open questions for Showmik
- Is the plan built on `48cc6f8` (hardening) or on `main` `241d3e4` / `feat/impeccable-ui-redesign`? These need reconciling first (see section 0).
- Which accent colour should we use?
- Dark or light by default?
- Can the COPQ gauge and the dashboard layout editor be dropped, or must they stay?
- Should Operators keep the Audit Trail (today they can see it)?

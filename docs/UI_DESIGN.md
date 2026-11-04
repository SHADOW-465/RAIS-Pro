# MOID UI design: philosophy, decisions and what to fine-tune

Branch: `feat/ui-redesign`. Written 4 Nov 2026 so Showmik can mark each decision **Keep / Change / Drop** and the next pass builds only what he approves.

## 1. The philosophy behind this redesign

1. **Glance first, detail on demand (3 levels).** Every screen answers one question. L1 is 3 to 5 numbers plus one main button, readable in about 5 seconds. L2 is one tap deeper: one main chart or table. L3 is full detail in a side drawer. Modelled on Samsung SmartThings tiles.
2. **One place per job.** The old app did the same thing in several places: 2 copies of the entry form, 3 lot views, 3 Excel areas, 4 stage views, 3 Ask MOID entry points. Each job now has one home, and the old URLs redirect.
3. **Fewer destinations.** The nav goes from 21 items to 9 (Home, Log, Excel files, Quality, Lots, Cost, Actions, Reports, Plant setup). Floor staff should never wonder where a thing lives.
4. **One main action per screen.** A single blue (#2563EB) button; everything else is neutral. Colour means "do this", not decoration.
5. **Calm, factory-friendly visuals.** Light theme, zinc greys, numbers in a monospace font, font weights capped at 600, 4/8 spacing. Status always shows an icon plus a word, never colour alone, for colour-blind users and bad screens.
6. **One global scope.** A single Scope chip (date, grain, sources, holidays) drives every page, instead of a date picker on each page that could disagree with the others.
7. **Show the role only what it needs.** The GM sees everything; the Owner gets read-only analysis; the Operator lands on Log.
8. **Never touch the numbers.** The redesign is layout and styling only. No API, server, calculation or conversion logic changed.

## 2. What I think the right UI for MOID is

MOID is used by two very different people: **floor staff logging batches**, and **managers reading quality**. The UI should be built around those two flows, not around chart types.

- **The Operator's home should feel like their Excel sheet.** The data entry staff trust their own Excel dashboard. Rebuild that view (same columns, same order, same totals) as the Operator's Log home, so MOID replaces Excel instead of competing with it. This matters more than any visual polish. *Not built yet; recommended next.*
- **Entry has to be fast and forgiving.** Keyboard-first (Tab and Enter through the grid), big save bar, totals that reconcile live, and an undo with a reason instead of "are you sure" walls.
- **Manager screens answer "is today OK, and what do I fix?"** Status line, 5 KPI tiles, the worst stage, size and defect, then one button into the suggested actions.
- **Trust signals everywhere.** Every number can open the drawer and show the batches and Excel rows behind it. That's what makes staff believe the app over their spreadsheet.
- **Desktop-first, tablet-safe.** The plant uses PCs, so design for 1280px and make sure it still works on a 10" tablet. No phone-first compromises.
- **Stay boring and consistent.** The same table, drawer, filter button and badge on every page. Consistency beats clever per-page layouts for staff who resist change.

## 3. Decisions to review (fill in the last column)

| # | Decision in the branch | Why | Your call (Keep / Change / Drop) |
|---|---|---|---|
| 1 | Nav cut from 21 items to 9, with old URLs redirecting | Less hunting | |
| 2 | Light theme by default, single blue accent #2563EB | Calm and readable on floor screens | |
| 3 | Top bar with one Scope chip, Ask, bell, Jump and user menu | One date and scope for every page | |
| 4 | Home: status line, 5 KPI tiles, one main action, AI brief collapsed to 3 bullets | 5-second answer | |
| 5 | Home layout editor moved under "Customise" (GM only), restyled | Kept as you asked, but out of the way | |
| 6 | COPQ gauge kept and restyled on Cost | Kept as you asked | |
| 7 | Quality is one page with tabs (Stage, Flow, Size, Defect, SPC); Stage gates merged into Flow | 4 stage views became 1 | |
| 8 | The 1/2/3/4 column layout switchers on the analysis pages removed | One responsive grid | |
| 9 | The old pop-up detail modal replaced by a right-hand side drawer | Same detail view everywhere | |
| 10 | Lots: Open and Hold merged into one table with tabs | 3 lot views became 1 | |
| 11 | Log: Data Entry and Batch Conversion share one header and area (logic unchanged, reason and undo kept) | One place to record batches | |
| 12 | Excel files: Upload, Check, Commit stepper, then a files list | Safer imports | |
| 13 | Actions: CAPA, Remedies and Alerts history as tabs; "Decision engine" renamed to "Suggested actions" | One "who's fixing what" page | |
| 14 | Reports gets a Custom chart tab (the old ChartBuilder) plus an Audit trail tab | Charts and proof live with reports | |
| 15 | Plant setup: Schema and Settings merged; the 3 defect lists merged into 1 | Configure once | |
| 16 | Ask MOID: one top-bar button, 4 starter questions, short answer first | 3 entry points became 1 | |
| 17 | Dead components deleted; emoji icons replaced with line icons | Clean-up | |
| 18 | Operators keep the Audit trail | You asked for this | |

## 4. Recommended next changes (not built)

1. An Operator home that mirrors the data entry staff's Excel dashboard (send me the file and I'll match it).
2. A keyboard-first entry grid with live reconciliation totals.
3. One Export menu (CSV, Excel, PDF) on every table and chart.
4. Fix the NaN charts and the dead items flagged in the PRD.

## 5. How to fine-tune

Fill in the column in section 3, or just tell me "#7 change: keep Stage and Flow as separate tabs". Each change goes on this branch as its own small commit, with tsc, tests, the build and before/after screenshots, and nothing goes live without your OK.

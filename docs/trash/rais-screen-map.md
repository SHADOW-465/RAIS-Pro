# RAIS — Screen Map + State Matrix
*Phase 3 output · MVP only*

---

## Screen Inventory

---
**SCREEN: Upload / Landing**
Purpose: Accept data files from the user
Primary action: Drag and drop (or browse) to select one or more Excel/CSV files, then trigger analysis

Empty state:
Full-screen dark background. RAIS logo and wordmark centred top. Large drop zone with dashed animated border takes up 60% of viewport. Bold headline "Drop your Excel files here." Subtext explains multiple file support. Browse button. Format badges (XLSX · XLS · CSV). No other UI elements. Nothing to configure, nothing to read first.

Loading state:
N/A — this screen has no async operations. Files are read client-side synchronously as they are added.

Error state:
If an unsupported file type is dropped: the file card renders with a red badge "Unsupported format" and an × to dismiss. The Analyze button is disabled until all listed files are valid. If a valid file is added but cannot be parsed (corrupt/protected): card shows "Could not read file · Remove and try again" in red. Other files are unaffected.

Success state:
File cards appear below the drop zone showing: file icon, filename, file size in KB, file type badge. An "Analyze with AI" primary CTA button appears below the file list. An "Add more files" secondary button sits next to it. The user can remove any file with the × on its card. Adding or removing files updates the list instantly.

---

**SCREEN: Processing / Analysis**
Purpose: Communicate that AI analysis is in progress
Primary action: None — this is a passive wait state. User watches and waits.

Empty state:
N/A — this screen is never shown empty.

Loading state:
This screen IS the loading state. Centred layout. Animated spinner (dual concentric rings with glowing dot). Below it: "Analyzing your data" as the headline. Below that: a vertical list of 5 steps with dot indicators that activate sequentially:
1. Reading Excel files
2. Extracting data structures
3. Building analysis context
4. Running AI analysis
5. Rendering dashboard
Each step transitions from inactive → active (pulsing ring) → done (green checkmark) as the process moves through it.

Error state:
If the Anthropic API call fails for any reason (network error, invalid key, timeout, malformed response): the app transitions to the Dashboard screen and renders a full-body error state instead of the dashboard. The error state shows: error icon, "Analysis failed" headline, human-readable error message, the raw error detail in a monospace code block, and a "← Try again" button that resets to the Upload screen.

Success state:
Auto-transitions to the Dashboard screen once the AI response is parsed and the render is complete. No intermediate success message — the dashboard itself is the success state.

---

**SCREEN: Dashboard**
Purpose: Display the AI-generated analytics dashboard
Primary action: Read the data, understand the situation, make decisions

Empty state:
N/A — this screen is only shown after a successful analysis. There is no empty dashboard state.

Loading state:
N/A — however, as the dashboard elements mount, they will execute a staggered fade-in animation, sequentially revealing the content elegantly.

Error state:
Full-body error card in the main content area (see Processing screen error state above). Sticky header is still visible so user can click "New Analysis" to reset.

Success state:
Full dynamic dashboard rendered in a single scrollable column under a sticky header. Structure from top to bottom:

1. Sticky header bar — RAIS logo, AI-generated dashboard title, timestamp, Export (print) button, New Analysis button
2. Alerts banner (conditional) — red band shown only if AI detects critical anomalies in the data. Hidden if no alerts.
3. Executive summary card — accent-bordered card with AI-written 2-sentence GM-level summary and data context line
4. KPI grid — 4–6 metric cards in a responsive auto-fit grid. Each shows: metric label, value with unit, trend arrow with percentage, context string
5. Chart grid — 4–8 charts in a 12-column CSS grid. Charts are sized full/half/third based on importance. Each card shows chart title, one-line description, and the rendered Chart.js canvas
6. Insights + Recommendations — two-column grid. Left: 5 numbered insights with specific data points. Right: 4 actionable recommendations for the GM
7. Data sources footer — chips showing each source file that fed the analysis

---

## Component Radar

**Forms**
- File input (hidden `<input type="file">`, triggered by button and drag events)
- Drag and drop zone with dragover/drop/dragleave event handling

**Data display**
- KPI card (label, value, unit, trend arrow, trend value, context)
- Chart card (title, description, Chart.js canvas — types: bar, horizontalBar, line, area, pie, doughnut, radar)
- Executive summary band (accent top border, label, body text, context subline)
- Alerts banner (conditional, red bordered band with list)
- Insights list (numbered items with monospace index)
- Recommendations list (bullet items)
- Data source chips (filename + green dot)
- Error state card (icon, headline, message, raw error, CTA)

**Navigation**
- Screen transitions: Upload → Processing → Dashboard (one-way, non-reversible except via "New Analysis")
- "New Analysis" button in header resets to Upload screen
- Sticky dashboard header (remains visible while scrolling)

**Feedback**
- Drop zone drag-active state (border-color + scale transition)
- Processing step animations (pulse on active, checkmark on done)
- File card remove (instant list update)
- Chart render animations (600ms ease-out on first draw)
- Print/export (native browser print dialog)

---

## Scope Verdict

**SCOPE CREEP: Dashboard export to PDF**
Cut because it requires a headless browser or PDF library (Puppeteer, jsPDF), adding significant complexity. The GM can print via the browser's native print dialog for MVP. Revisit in v2.

**SCOPE CREEP: Saved analysis history**
Cut because it requires either localStorage (unreliable for large data) or a backend (contradicts the zero-server architecture). Each session is disposable. Revisit only if users explicitly ask to share dashboards with colleagues.

**SCOPE CREEP: Column mapping / configuration UI**
Cut because it directly contradicts the zero-friction value proposition. If the AI cannot infer column meaning from the data, improve the prompt — do not ask the user to do it manually.

**SCOPE CREEP: Multiple analytical lenses / re-analysis modes**
Cut from MVP. The single AI pass should produce a comprehensive dashboard. Lens-based re-analysis (e.g., "cost view vs. quality view") is a compelling v2 feature but would double AI API costs and require a more complex UI.

**SCOPE CREEP: Authentication / user accounts**
Cut entirely. No accounts needed for MVP, although the React architecture supports adding this later far more easily.

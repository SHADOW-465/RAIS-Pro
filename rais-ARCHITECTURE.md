# RAIS — Architecture
*Phase 5 output · MVP specification*

---

## Stack

| Layer | Technology | Version | Why this choice |
|---|---|---|---|
| Runtime | Browser (Chrome/Arc/Edge) | Modern evergreen | No install required — GM opens one file. Safari excluded for now (Fetch API streaming inconsistencies). |
| Structure | Vanilla HTML/CSS/JS | ES2020 | No build step, no npm, no bundler. Single file that opens anywhere. A framework would require a dev environment to edit — wrong for this use case. |
| Excel parsing | SheetJS (xlsx) | 0.18.5 | The only mature client-side Excel parser. Handles .xlsx, .xls, and .csv. Loaded from jsdelivr CDN. Alternative (exceljs) is Node-only. |
| Charts | Chart.js | 4.4.0 | Best balance of chart variety, bundle size, and customisability for client-side use. D3 is overkill. Recharts is React-only. Echarts is 1MB+. |
| AI analysis | Anthropic claude-sonnet-4 API | claude-sonnet-4-20250514 | Best-in-class instruction following for structured JSON output. The prompt demands precise chart data format compliance — smaller models hallucinate chart data. GPT-4o is comparable but more expensive for this use case. |
| Fonts | Google Fonts (Barlow Semi Condensed + JetBrains Mono) | Latest | Loaded via preconnect link tag. Subset to required weights only. |
| Deployment | Static file hosting / email attachment | — | No server needed. Can be hosted on any CDN (Vercel, S3, Netlify) or sent as a file attachment. |

---

## Project Structure

```
rais/
├── RAIS-dashboard.html        # The entire application. One file.
│
├── docs/                      # Builder OS documents (this folder)
│   ├── rais-living-brief.md
│   ├── rais-screen-map.md
│   ├── rais-design-language.md
│   ├── rais-ARCHITECTURE.md
│   └── rais-PRD.md
│
└── README.md                  # How to use, how to embed API key, known limits
```

The application itself is intentionally a single file. There is no src/ directory, no components/, no styles/. If the project grows to require a build step, that is the signal to reconsider the architecture — not to add complexity to the current one.

---

## Data Flow

```
User drops Excel files
       ↓
FileReader API reads each file as ArrayBuffer (client-side)
       ↓
SheetJS parses each workbook → array of sheet objects
       ↓
summarizeSheet() computes per-column stats:
  - Numeric columns → {count, min, max, avg, sum, sample[20]}
  - Categorical columns → {uniqueCount, distribution: top-20 frequency map}
  - First 8 rows preserved as sampleRows
       ↓
buildPrompt() serialises all summaries to JSON (truncated at 12,000 chars)
       ↓
POST /v1/messages → Anthropic API (claude-sonnet-4)
  System: "Senior data analyst. Return only valid JSON."
  User: full prompt with dataset summary + JSON schema
       ↓
API returns dashboard configuration JSON:
  {dashboardTitle, executiveSummary, dataContext,
   kpis[], charts[], insights[], recommendations[], alerts[]}
       ↓
renderDashboard() injects HTML for:
  - Alerts banner (if alerts[].length > 0)
  - Executive summary card
  - KPI grid (4-6 cards)
  - Chart grid (4-8 Chart.js instances)
  - Insights + Recommendations panels
  - Data sources footer
```

---

## AI Prompt Architecture

The prompt is the most critical piece of this system. It has three parts:

**System prompt (constant):**
Establishes persona (senior data analyst), bans vague output, requires JSON-only response.

**User prompt (dynamic, generated per analysis):**
- Dataset summary JSON (column stats, distributions, sample rows)
- Strict JSON schema with field descriptions
- Rules enforcing: real numbers only, chart type selection criteria, specific counts (4-6 KPIs, 4-8 charts, 5 insights, 4 recommendations)

**Response parsing:**
The response text is matched against `/\{[\s\S]*\}/` regex to extract the first JSON object. This handles cases where the model adds a preamble or wrapping text despite instructions. If JSON.parse fails, the error is surfaced to the user.

**Current token budget:**
- Prompt: ~2,000–4,000 tokens (varies with dataset size, capped at 12,000 chars of summary)
- Response: max_tokens set to 4,000
- Total per analysis: ~6,000–8,000 tokens (~$0.02–0.04 at current pricing)

---

## Key Functions

```js
parseFile(file)
  → reads file as ArrayBuffer via FileReader
  → passes to SheetJS XLSX.read()
  → maps each sheet through summarizeSheet()
  → returns { fileName, sheets: [sheetSummary] }

summarizeSheet(data, sheetName)
  → iterates columns, classifies as numeric or categorical
  → for numeric: computes count/min/max/avg/sum + 20-value sample
  → for categorical: builds frequency map, keeps top 20 entries
  → returns { sheetName, totalRows, columns, columnAnalysis, sampleRows }

buildPrompt(parsedFiles)
  → serialises parsed file summaries to JSON
  → truncates to 12,000 chars if needed
  → appends strict schema + rules
  → returns full prompt string

callAPI(prompt)
  → POST to https://api.anthropic.com/v1/messages
  → non-streaming (dashboard renders all at once)
  → extracts JSON from response text with regex
  → returns parsed dashboard config object

renderDashboard(config, parsedFiles)
  → destroys existing Chart.js instances
  → injects HTML for each section
  → calls renderChart() for each chart in config.charts

renderChart(canvas, chartConfig, index)
  → maps RAIS chart types to Chart.js types
     (horizontalBar → bar + indexAxis:'y', area → line + fill:true)
  → applies CHART_COLORS and CHART_BORDERS palettes
  → configures dark-mode axes, grid, tooltip
  → instantiates Chart and pushes to chartInstances[]
```

---

## Environment Variables

This is a client-side application. There are no server-side environment variables. The Anthropic API key is the only secret.

**For personal use (MVP):**
The API key is passed directly in the fetch request header. The file is used by one person on their own machine. Acceptable risk.

**For team/shared deployment:**
Do not embed the API key in a file that will be shared. Instead:

Option A — Lightweight proxy (recommended):
```
Deploy a Cloudflare Worker or Vercel Edge Function that:
  - Receives POST /proxy/messages from the frontend
  - Adds the Authorization header server-side
  - Forwards to api.anthropic.com
  - Returns the response

The HTML file then calls /proxy/messages instead of api.anthropic.com directly.
```

Option B — User-provided key:
```
Add an API key input field to the upload screen.
Store in sessionStorage (cleared on tab close).
Use it in the Authorization header.
Display a clear notice that the key is not stored.
```

```
ANTHROPIC_API_KEY     Your Anthropic API key — get from console.anthropic.com
                      Format: sk-ant-api03-...
                      Used in: Authorization: x-api-key header
                      Never commit to git. Never embed in a shared file.
```

---

## Dev Setup

This application requires no build step, no package manager, and no local server for basic use.

```bash
# Open directly in browser
open RAIS-dashboard.html

# Or serve locally if you need to test CORS behaviour
npx serve . --port 3000
# then open http://localhost:3000/RAIS-dashboard.html

# To edit: open in any text editor
code RAIS-dashboard.html

# To deploy (static hosting):
# Vercel
vercel --prod

# Netlify drag-and-drop
# Drag the file to netlify.com/drop

# AWS S3 static site
aws s3 cp RAIS-dashboard.html s3://your-bucket/ --acl public-read
```

---

## Architectural Decisions

**Decision:** We chose a single-file no-build architecture over a React/Vite SPA.
**Why:** The primary user (GM) does not have a developer available to run `npm install`. The single file opens in any browser with a double-click or email attachment. Zero deployment friction is itself a product feature.
**Trade-off:** We give up hot module reload, component isolation, TypeScript, and easy extensibility. If the product grows to require user accounts, saved dashboards, or team collaboration, this architecture will need to be rebuilt — not extended.

**Decision:** We chose non-streaming API calls over streaming.
**Why:** The dashboard config is a single JSON object that must be complete before rendering can begin. Streaming partial JSON has no UX benefit here — we cannot render half a dashboard. The processing screen animation covers the wait time.
**Trade-off:** The user waits 10–25 seconds with no progressive feedback from the API response itself. Mitigated by the processing step indicators.

**Decision:** We chose client-side data summarisation over sending raw data to the API.
**Why:** Sending full Excel data would cost significantly more in tokens, hit context limits on large files, and expose potentially sensitive operational data in transit. Summarised stats (column distributions, min/max/avg) give the AI enough signal to generate meaningful charts without raw rows.
**Trade-off:** The AI cannot perform calculations that require row-level data (e.g., percentile analysis, outlier detection on individual records). Insights are based on aggregate statistics, not individual data points.

---

## Build Order

Build in this exact order. Do not touch the dashboard UI until step 3 is complete.

1. **File parsing pipeline.** Get SheetJS working. Can you parse a real Excel file and log column stats to the console? Do not proceed until this works with messy, real-world files (merged cells, empty rows, mixed types).

2. **Data summarisation.** Write and test `summarizeSheet()` against at least 5 different Excel structures: a pivot table, a simple list, a time-series, a multi-sheet workbook, and a CSV. Log the summary object. It should be readable JSON that a human could understand.

3. **AI prompt and response parsing.** Call the API with a real summary. Does it return valid JSON? Does `renderChart()` type mapping work for all 7 chart types? Handle the regex extraction and JSON.parse error cases before building any UI.

4. **Dashboard rendering (static test).** Hardcode a sample config JSON and render the full dashboard from it. Get the layout, typography, KPI cards, and chart grid right before connecting to live AI output.

5. **Wire everything together.** Connect file parsing → summarisation → API call → render. Test with 1 file, then 3 files, then 7 files.

6. **Edge cases and error handling.** Empty sheets. Corrupt files. API timeout. Files with 1 column. Files with 200 columns. Files where every column is numeric. Files where every column is text. The app should never show a blank white screen.

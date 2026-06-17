# RAIS — Architecture
*Phase 5 output · MVP specification*

---

## Stack

| Layer | Technology | Version | Why this choice |
|---|---|---|---|
| Runtime | Browser (Chrome/Arc/Edge/Safari) | Modern evergreen | Accessible via URL on any modern browser. |
| Structure | Next.js (App Router) | Latest | Industry standard for full-stack React applications. Provides robust routing, SSR, and optimized image/font handling. |
| Excel parsing | SheetJS (xlsx) | Latest | Client-side Excel parsing to avoid sending raw data to servers. |
| Charts | Chart.js + react-chartjs-2 | Latest | Best balance of chart variety, bundle size, and customisability. |
| Animations | Framer Motion | Latest | Enables premium staggered fade-ins and dynamic micro-interactions. |
| AI analysis | Anthropic Claude API | claude-3-5-sonnet | Best-in-class instruction following for structured JSON output. |
| Database/Auth | Supabase | Latest | Backend-as-a-Service for data persistence and secure Edge Functions. |
| Deployment | Vercel | — | Primary host for Next.js applications with native Edge Function support. |

---

## Project Structure

```
rais/
├── package.json
├── next.config.js
├── public/
├── src/
│   ├── app/                   # Next.js App Router (Layouts, Pages)
│   ├── components/            # React components (Dashboard, ChartCard, etc.)
│   ├── library/               # Shared logic, Supabase client
│   ├── styles/                # Global CSS and Tailwind/Modules
│   └── types/                 # TypeScript definitions (optional for robustness)
├── supabase/                  # Migrations and Edge Functions
├── docs/                      # PRD, Architecture, etc.
└── README.md
```

The application is built using Next.js to provide a robust, production-ready framework for the "full on" web dashboard experience.

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

This is a modern web application designed for premium UI delivery.

**For local development:**
Store the API key in a `.env` file:
```
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
```

**For production deployment:**
Option A — Vercel Edge Function / Proxy (recommended):
```
Instead of exposing the key on the frontend, deploy an edge function with Vercel or Cloudflare that holds the Anthropic API key and proxies requests from the React app.
```

Option B — User-provided key:
```
Add an API key input field to the upload screen.
Store in sessionStorage (cleared on tab close).
```

---

## Dev Setup

This application is built with Next.js.

```bash
# Install dependencies
npm install

# Run local dev server
npm run dev

# Build for production
npm run build

# To deploy:
# Push to GitHub and connect to Vercel.
```

---

## Architectural Decisions

**Decision:** We chose Next.js over Vite.
**Why:** Next.js is better suited for a "full on web dashboard" as it provides built-in routing, better performance optimizations (SSR/ISR), and seamless integration with Vercel and Supabase. It allows for a more robust full-stack foundation compared to a pure Vite SPA.
**Trade-off:** Slightly higher complexity and larger initial bundle size compared to Vite, but worth it for a premium full-stack product.

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

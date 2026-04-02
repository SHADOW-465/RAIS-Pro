# RAIS — Product Requirements Document
*Version 1.0 · MVP · April 2026*

---

## Overview

| Field | Detail |
|---|---|
| Product name | RAIS — Rejection Analysis & Intelligence System |
| Version | 1.0 MVP |
| Product type | AI-powered data analytics dashboard (client-side web app) |
| Primary user | General Manager / Operations Director |
| Problem statement | GMs spend 60–180 minutes per reporting cycle reading multiple Excel files to understand operational data before they can make decisions. The data is correct but the format is wrong for decision-making. |
| Solution | A drag-and-drop interface that ingests multiple Excel/CSV files and uses AI to generate a fully contextualised, dynamic analytics dashboard in under 30 seconds. |
| Success metric | Time from opening RAIS to data-informed decision: under 5 minutes (down from 60–180 minutes) |

---

## Problem Statement

### Context
Operations teams at manufacturing, retail, logistics, and service companies collect data in Excel. Department heads export reports as .xlsx files and email them to their GM for review. The GM must:
- Open each file individually
- Cross-reference numbers across files
- Mentally aggregate and compare data points
- Build their own summary interpretation
- Create reports and communicate findings

This process is time-consuming, error-prone, and entirely manual. The GM is not a data analyst — they are a decision-maker performing analyst work because the tooling has not caught up.

### The Gap
Existing BI tools (Power BI, Tableau, Looker) solve this problem but require: dedicated data engineers, database connections, weeks of setup, and ongoing maintenance. They are built for organisations with data infrastructure. RAIS is built for organisations where the data infrastructure is someone's email inbox.

---

## User Personas

### Primary: The GM
- **Name:** Ahmad (composite)
- **Role:** General Manager, mid-size company (50–500 employees)
- **Tech comfort:** Intermediate — uses Excel, email, basic SaaS tools
- **Context:** Receives 5–10 Excel reports per week from department heads
- **Pain:** Spends first 1–2 hours of each day reading Excel before management calls
- **Goal:** Understand the business state quickly and make confident decisions
- **Non-goal:** Deep dive analytics, statistical modelling, data warehousing

### Secondary: The Department Head (data provider)
- Not a direct RAIS user — they provide the Excel files
- Their behaviour does not need to change for RAIS to work
- Benefit: fewer follow-up questions from the GM

---

## Functional Requirements

### F1 — File Ingestion
| ID | Requirement | Priority |
|---|---|---|
| F1.1 | Accept multiple .xlsx files simultaneously via drag-and-drop | Must have |
| F1.2 | Accept .xls and .csv files | Must have |
| F1.3 | Accept file selection via browse button | Must have |
| F1.4 | Allow files to be removed from the queue before analysis | Must have |
| F1.5 | Allow additional files to be added after initial selection | Must have |
| F1.6 | Parse all sheets within a multi-sheet workbook | Must have |
| F1.7 | Handle Excel files with merged cells, empty rows, and mixed data types | Must have |
| F1.8 | Display file name and size for each queued file | Should have |
| F1.9 | Show sheet count per file after parsing | Nice to have |

### F2 — Data Processing
| ID | Requirement | Priority |
|---|---|---|
| F2.1 | Parse Excel files entirely client-side — no data transmitted to any storage server | Must have |
| F2.2 | Compute per-column statistics: min, max, avg, sum, count (numeric columns) | Must have |
| F2.3 | Compute value frequency distributions for categorical columns (top 20 values) | Must have |
| F2.4 | Preserve 8 sample rows per sheet for AI context | Must have |
| F2.5 | Truncate combined dataset summary at 12,000 characters before sending to AI | Must have |
| F2.6 | Handle files with up to 50,000 rows without browser crash | Must have |

### F3 — AI Analysis
| ID | Requirement | Priority |
|---|---|---|
| F3.1 | Send summarised dataset to Anthropic Claude API | Must have |
| F3.2 | Receive structured JSON response specifying dashboard configuration | Must have |
| F3.3 | AI response must include: title, executive summary, 4–6 KPIs, 4–8 charts, 5 insights, 4 recommendations | Must have |
| F3.4 | AI must select chart types appropriate to the data (not a fixed template) | Must have |
| F3.5 | All KPI values and chart data must be derived from actual uploaded data | Must have |
| F3.6 | Display 5-step progress indicator during API call | Must have |
| F3.7 | Handle API errors gracefully with human-readable message and retry option | Must have |
| F3.8 | AI must detect and flag critical data anomalies in an alerts section | Should have |

### F4 — Dashboard Rendering
| ID | Requirement | Priority |
|---|---|---|
| F4.1 | Render dynamic dashboard from AI-generated configuration | Must have |
| F4.2 | Display 4–6 KPI cards with value, trend arrow, percentage change, and context | Must have |
| F4.3 | Render 4–8 charts using Chart.js, dynamically sized (full/half/third width) | Must have |
| F4.4 | Support chart types: bar, horizontal bar, line, area, pie, doughnut, radar | Must have |
| F4.5 | Display AI-generated executive summary as the first content element | Must have |
| F4.6 | Display 5 numbered insights with specific data references | Must have |
| F4.7 | Display 4 actionable recommendations | Must have |
| F4.8 | Show data source file names in footer | Must have |
| F4.9 | Show conditional alerts banner when AI detects critical issues | Must have |
| F4.10 | Dashboard title generated by AI based on data content | Must have |
| F4.11 | Timestamp showing when analysis was run | Should have |
| F4.12 | "New Analysis" button that resets to upload screen | Must have |
| F4.13 | Browser print / export via native print dialog | Should have |

---

## Non-Functional Requirements

### Performance
- File parsing (client-side): < 3 seconds for files up to 10MB
- API response: 10–30 seconds (acceptable given value delivered)
- Dashboard render after response: < 1 second
- Total time from drop to dashboard: target under 35 seconds

### Privacy & Security
- No Excel data is stored on any server — processing is entirely client-side
- Only statistical summaries (not raw data) are sent to the Anthropic API
- Anthropic API key is not stored in browser storage — lives in the HTML file for MVP
- No user accounts, no cookies, no tracking

### Compatibility
- Chrome 90+ (primary)
- Arc, Edge (Chromium-based)
- Firefox 88+
- Safari 14+ (with caveat: streaming fetch may differ)
- Mobile: not a primary use case, no responsive optimisation required for MVP

### Reliability
- App must not crash on: empty sheets, single-column files, all-text data, files with special characters in column names
- AI errors must surface as readable messages, never as unhandled exceptions
- Chart rendering must never block the rest of the dashboard from loading

---

## Out of Scope (MVP)

The following are explicitly excluded from v1.0:

| Feature | Reason excluded |
|---|---|
| User authentication / accounts | Requires backend — contradicts zero-server architecture |
| Dashboard save / share | Requires storage — revisit in v2 |
| PDF export | Requires headless rendering — use native print for MVP |
| Historical comparison across sessions | Requires state persistence |
| Column mapping configuration | Contradicts zero-friction value prop |
| Multiple analytical lenses | Doubles AI cost — v2 feature |
| Scheduled / recurring analysis | Requires server-side triggers |
| Database or API connections | RAIS is file-based — this is a different product |
| Mobile-first layout | GM use case is desktop/laptop |
| Multi-language support | English only for MVP |

---

## Acceptance Criteria

The MVP is complete when:

1. A GM can drop 5 different Excel files and receive a unique, data-accurate dashboard within 35 seconds, without configuring anything.

2. The dashboard produced from a sales Excel is demonstrably different from the dashboard produced from a manufacturing rejection Excel — different chart types, different KPIs, different recommendations.

3. Removing all Excel files from the queue and clicking "New Analysis" correctly resets to a clean upload state.

4. Dropping a corrupted or unsupported file shows a specific error on that file card without breaking the rest of the upload flow.

5. An API failure (wrong key, timeout, malformed response) shows a readable error message with a retry option — never a blank screen or unhandled console error.

6. The application file can be emailed as an attachment, opened by a recipient on a different machine with no install, and used immediately.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| AI returns malformed JSON | Medium | High | Regex extraction + JSON.parse try/catch + user-facing error with retry |
| Excel file has no identifiable numeric data | Medium | Medium | AI will still describe what it sees and generate text-based insights; charts may be sparse |
| Token limit exceeded for very large files | Medium | Medium | 12,000 char truncation on summary; sampling strategy can be improved post-MVP |
| Anthropic API key exposed if file is shared | High | High | Document clearly in README; provide proxy option for shared deployments |
| Browser blocks fetch to api.anthropic.com (CORS) | Low | High | Anthropic allows browser-side CORS for the messages endpoint; verify before launch |
| User uploads 20+ files and the prompt becomes incoherent | Low | Medium | Test with high file counts; consider a "max 10 files" limit with clear messaging |

---

## Version History

| Version | Date | Changes |
|---|---|---|
| 1.0 | April 2026 | Initial MVP specification |

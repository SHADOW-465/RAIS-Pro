# RAIS — Living Brief
*Last updated: April 2026 · Status: Active*

---

## The Problem

GMs at companies receive operational data from department heads as multiple Excel files every reporting cycle. To understand the state of their operations, they open each file one by one, scroll through rows and columns, manually cross-reference numbers across sheets, and try to piece together a coherent picture in their head. This process takes 60–180 minutes per cycle, leaves serious room for misreading or missing critical data, and delays decisions that should take minutes. The problem is not that GMs lack intelligence — it is that raw Excel is the wrong medium for decision-making, and no one has changed the format.

The exact moment of suffering: Ahmad opens his laptop Monday morning to find 7 Excel attachments from department heads. He opens File 1, scrolls to find the rejection totals, switches to File 2, tries to remember if last week's number was better or worse, opens File 3, loses his place, starts a notepad to copy numbers manually. Forty-five minutes later he has a rough picture — but he is not confident in it, and he still has to build his own summary report from scratch.

---

## The User

Ahmad (composite GM, mid-size manufacturing company, 47). He has been in operations for 20 years and understands his business deeply — but he is not a data analyst and should not need to be. He manages 5 department heads who each send him weekly Excel reports. His mornings are dominated by reading these files before the 9am management call where he is expected to have answers. He has tried asking staff to format reports differently — it never sticks. He has tried building his own summary spreadsheet — it becomes outdated immediately. What he actually needs is for someone to read all the files and brief him in plain language, with the charts already drawn. RAIS is that person.

---

## The Core Loop

Ahmad opens RAIS in his browser — no login, no install, just a file. He drags all seven of his Excel files into the drop zone at once. Thirty seconds later, a fully structured dashboard appears: the headline KPIs at the top, the most important charts below, and at the bottom, a plain-language executive summary and five specific recommendations. He reads it in four minutes. He walks into the 9am call knowing exactly what to say.

That is the entire product. Everything else is secondary.

---

## What We Will Never Do

- **We will never require any setup, configuration, or column mapping before the user gets value.** Drop files, get dashboard. The moment the app asks a user to "define your schema" or "map your date column," we have failed.
- **We will never store, transmit, or retain user data on any server.** All processing happens client-side in the browser. The company's operational data never leaves the machine. This is not a legal hedge — it is a design principle.
- **We will never show the same static dashboard regardless of what was uploaded.** The dashboard must be generated from the actual data. Pre-built templates that get populated with numbers are a different product — a worse one.

---

## The One Metric

Time from opening RAIS to making a data-informed decision: target under 5 minutes, down from 60–180 minutes today.

---

## Tech Direction

A modern, premium Next.js web dashboard. Everything runs fluidly via a hosted web app using SheetJS (Excel parsing), Framer Motion (for staggered fade-ins), Supabase (for database and secure edge functions), and the Anthropic API. Next.js provides the robust framework necessary for a "full on" premium experience.

[ASSUMPTION: The app will be hosted on Vercel with a Supabase backend.]

---

## Open Questions

1. **Token limits on large files.** How do we handle Excel files with 50,000+ rows without degrading AI analysis quality? The current summarization approach (stats + sample rows) works for medium datasets, but very large files may require smarter sampling or chunked analysis.

2. **Session persistence vs. disposability.** Does the GM need to save a dashboard and share it with the team, or is each session a one-time read? The React SPA architecture allows for saving URLs with encoded data to share states in the future.

3. **Multiple analytical lenses.** Should the user be able to re-analyze the same files with a different focus — e.g., "show me only the cost view" or "focus on the quality metrics"? This could be a high-value feature that keeps the zero-setup promise intact.

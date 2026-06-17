# D8 — Disposafe Discovery Field Guide (exhaustive)

**For:** the student (GM's son, insider access) · **Goal:** capture everything to build RAIS now
AND the long-term MO!D operational-intelligence system. **Stance:** they asked vaguely for
"rejection statistics" — they don't yet know what they need; *our job is to find it.* Updated
2026-06-12.

> **Client = Disposafe, Delhi** (medical-device manufacturer). Language for any UI/labels =
> **Hindi/English**, NOT Tamil (correct earlier docs). Compliance frame = ISO 13485 + Medical
> Device Rules 2017 (CDSCO); see [[manufacturing-intelligence-domain-primer]].

---

## 0. How to run this (insider advantage — don't waste it)
Words describe; artifacts prove. Because he has access, prioritize **collecting + observing**
over asking:
- **Collect** (★ = critical): ★blank templates AND ★filled samples of EVERY report/register;
  ★3–5 historical Excel files per report type; the org chart; any SOPs; a sample of the GM's
  upward report; one example of a monthly quality review output; the price/cost sheet if allowed.
- **Observe:** a floor walk of the full line; watch an operator actually record a reading; sit
  in (or get notes from) one monthly quality/rejection review meeting.
- **Photograph:** the paper registers at each station, any whiteboards/visual boards, the
  physical inspection setup.
- **Record verbatim** (with permission): how each person describes their own pain — their
  words become our feature language.
Run sections A→K as a conversation, not an interrogation. Tag each answer **[RAIS]** (needed
now) or **[MO!D]** (long-term) — both matter; we're scoping two horizons at once.

---

## A. Company & product context  [MO!D foundation]
1. What product lines do you make? (syringes / IV sets / catheters / balloons / valves / …) —
   which line is the pilot focus?
2. Monthly/annual volume per line? Batch/lot sizes? How many shifts, how many lines?
3. Device risk class (A/B/C/D under MDR 2017)? Which licence (MD-5 / MD-9)?
4. Which markets do you sell to / export? Which regulators audit you (CDSCO / US FDA / CE / WHO)?
5. Certifications held (ISO 13485, others)? When is the next audit/renewal?
6. Is the factory the only site, or are there sister plants? (multi-plant = future scope)

## B. The manufacturing process — full flow  [RAIS + MO!D · this is the VSM backbone]
7. ★Walk me through the entire process for the pilot line, stage by stage, raw material →
   dispatch. (Draw it together; this is the single most valuable artifact.)
8. Which stages have inspection/QC checks? In-process vs final inspection?
9. Is the flow strictly sequential, or do stages run in parallel / out of order?
10. Where does material wait between stages (WIP buffers)? How is waiting stock tracked?
11. ★What happens to a rejected item — scrapped, reworked, held for review, or downgraded?
    If reworked, does it re-enter the line, and is that tracked anywhere?
12. How is a "batch/lot" defined, and can you trace one lot across all stages? (recall basis)
13. Do quantities change between stages because stock accumulates / is inspected in bulk rather
    than per-batch? (This is why their numbers don't conserve — confirm how/where.)

## C. How data is born — capture at each stage  [RAIS critical]
14. ★At each stage: WHO records the numbers, on WHAT (paper register / Excel / printout), and
    WHEN (live at the station, or typed up later)?
15. ★Is data entered more than once (register → Excel → ERP → report)? Where are the re-typing
    steps? (each is an error source + a time cost)
16. ★For every report type: get the blank template + a filled example. What does each column
    mean? What are the units (pcs / trolleys / kg / boxes)?
17. Which fields are mandatory vs often left blank? (e.g. the empty-January assembly sheet)
18. Are any readings handwritten/scanned, or all digital? Any photos of defects kept?
19. Who consolidates the daily/weekly/monthly sheets, and how long does that take?
20. File logistics: where are these stored, what's the naming convention, can we get a full
    historical dump (several years, all report types)? ★He can likely just copy these.

## D. Rejections & quality specifics  [RAIS core]
21. ★What are the common defect types per product/stage? Get the FULL defect list + what each
    code/abbreviation means (BM, PS, OG, BST… — their glossary).
22. Do different lines use the same defect names, or do they vary? Any misspellings/aliases in use?
23. ★How exactly do you define and calculate "rejection rate" today? (rejected ÷ checked?
    ÷ produced? per stage or overall?)
24. Where in the process do you see the MOST rejections? Which defect hurts most (volume / cost)?
25. Do you track first-pass quality vs after-rework? (decides if we can show FPY/RTY)
26. Do you record measurements (dimensions, pressures, leak rates) or only pass/fail counts?
    (decides if we can do SPC/Cpk later)
27. Is there a threshold/limit that triggers an alarm or action today? Who decides it?

## E. Current analysis practice  [RAIS — defines what we replace]
28. ★Who does the analysis — one person or a team? What's their role/designation?
29. ★How often is analysis done (daily / weekly / monthly)? How many hours does it take?
30. What tools do they use — Excel only, or Minitab / SAP / other? What formulas/macros?
31. ★Which methods do they actually use: Pareto, trend charts, SPC/control charts, fishbone,
    5-Why, FMEA, cost analysis? Which do they WANT to use but find too tedious manually?
32. ★What decisions come out of the analysis? "Show me a decision you made last month from a
    rejection report." (the product must serve decisions, not just display data)
33. What do they currently do well that we must NOT break or replace?

## F. Existing systems & integration  [MO!D]
34. What software runs the business — ERP (SAP/Oracle/Tally/custom)? MES? Any QMS software?
35. Do any machines output data digitally (counters, weighers, testers)? Protocols (OPC-UA/MQTT)?
    (gates the future real-time pipeline — research file flagged this)
36. Could MO!D pull from / push to the ERP later, or must it stay standalone for now?

## G. Pain points & goals — per stakeholder  [RAIS + MO!D]
37. ★Ask EACH role separately "what's your biggest daily frustration with quality data, and what
    would make your life easier?":
    - GM / Plant Head — what decision/visibility is hardest? What does he report upward, to whom?
    - Production Manager — what surprises him too late?
    - QA / Quality Engineer — where does month-end hurt?
    - Operators / line QC — what paperwork do they hate?
38. ★"If this system did ONE thing perfectly, what should it be?" (ask each stakeholder)
39. Has a wrong/late number ever caused a bad decision, customer complaint, or audit remark?
    (the pain story — gold for the pitch)
40. What does "success" look like to the GM in 6 months?

## H. Compliance, audit & data integrity  [MO!D differentiator]
41. ★Who audits you, how often, and what did the last audit flag about records/data?
42. What are your data-integrity / record-keeping requirements (ALCOA+, retention period)?
43. Do you need electronic signatures / per-user audit trails (21 CFR Part 11 style)?
44. ★How is CAPA / non-conformance handled today, and in what form (paper / Excel / software)?
    How long does a CAPA take to close? (our recommendations can output in CAPA shape)
45. ★On-prem or cloud? Any rule that data cannot leave their servers? (decides hosting)
46. Who is allowed to see what? Is volume/cost data sensitive across roles? (feeds RBAC)

## I. Financial / ROI  [pitch ammunition]
47. ★What does a rejected unit/lot cost (material + labour + overhead)? Cost of rework vs scrap?
48. Which defect or stage loses the most money per month?
49. Roughly how many person-hours/month go into compiling + checking + analyzing reports?
    (× salary = the ROI number)

## J. Roles & the role-based dashboard  [RAIS V1 design input]
50. ★Get the org chart with exact designations and who-reports-to-whom.
51. For each role, what 3–5 numbers do they actually care about daily?
52. Who should be able to upload/enter data, who only views, who approves/adjudicates anomalies?

## K. Data-quality evidence to capture (proof the system is needed)
53. ★Collect the specific errors already spotted, as live demo material:
    - Assembly yearly sheet — **total formula is wrong** (capture the cell + correct value).
    - Assembly **January sheet empty** → skews yearly results (capture how it distorts the %).
    - (Plus our earlier finds: shopfloor total omits a column; yearly report sums percentages;
      VISUAL stated REJ ≠ sum of reasons.)
54. Ask innocently: "when two reports disagree, which do you trust, and how do you reconcile?"
    (reveals their mental model of their own data)

---

## L. PARK FOR LATER — discussion stubs (do NOT scope now; light-touch only)
### L1. General / morale "factory floor" dashboard (student's idea)
A public/shared view showing live plant health + positive momentum (rejections trending down,
streaks, targets hit) to boost team morale. **Worth a deep-dive later.** Light questions to seed
it: Is there a shop-floor display/TV today? What would motivate vs demotivate operators to see?
Any metrics that must NOT be shown publicly (blame risk)? *Caution to explore later: public
defect numbers can feel punitive — design must celebrate improvement, not shame individuals.*

### L2. AI worker-training app (GM mentioned)
Train workers on every process via video + interactive Q&A. **Separate product, separate
discussion.** Seed questions only: How are workers trained today? Language? Literacy level?
Turnover rate? SOPs documented? This likely maps to ISO 13485 training-record requirements —
a real compliance hook — but keep it parked until RAIS/MO!D direction is locked.

---

## M. Logistics & next step
- Confirm: can he share real files + historical data with us to build against? (yes, via his access)
- Schedule a follow-up to walk us through the collected artifacts.
- Everything tagged [RAIS] feeds the current build; [MO!D] + L1/L2 feed the long-term roadmap
  in `docs/MOID-BLUEPRINT.md`.

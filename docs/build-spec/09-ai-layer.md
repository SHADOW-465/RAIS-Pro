# 09 · AI Layer

**Two jobs only: classify columns, write prose. The model never computes a KPI or chart value.**

## 9.1 Provider chain — `tryModels` (`src/lib/ai.ts`)
All AI calls go through `tryModels(fn, opts)`. It walks `availableBackends()` and returns the first success; failures cascade.
```
DEFAULT_ORDER = ["groq", "nvidia", "openrouter"]          // PoC free-tier chain
RAIS_AI_BACKEND env → moved to front (not exclusive)
availableBackends() filters to backends whose API key is present
Default models:
  groq:       main llama-3.3-70b-versatile           fast llama-3.1-8b-instant
  nvidia:     main meta/llama-3.3-70b-instruct        fast meta/llama-3.1-8b-instruct
  openrouter: main meta-llama/llama-3.3-70b-instruct:free  fast …:free
Env: GROQ_API_KEY/_MODEL/_MODEL_FAST, NVIDIA_API_KEY/…, OPENROUTER_API_KEY/…
getModel({fast?}) = resolveModel(activeBackend, fast)
```
> **On-prem:** add **Ollama** (`meta-llama-3-8b-instruct`) as a backend and make it first/only. The chain pattern is the integration point — keep `tryModels`, swap the backend list. (Note: AGENTS.md mentions a Gateway→…→Ollama chain; the **actual** PoC code is Groq→NVIDIA→OpenRouter. Document the real one, target Ollama for prod.)

Retriable detection: HTTP 401/402/403/429/5xx or message `/rate.?limit|quota|unauthor|forbidden|payment|insufficient|overload|capacity|timeout|econnreset|fetch failed/`. Always cascades; throws last error if all fail.

## 9.2 Structured output discipline
- Always `generateObject` + a **Zod schema**, via `tryModels`. Never a raw model handle.
- **Cross-provider rules** (`src/lib/schemas.ts`): use `.nullable()` not `.optional()` (Groq/OpenAI strict mode); plain ints not literal unions (Google); strings not type-unions for KPI/value fields. Run `npm run check:ai` after any schema change — it pings every backend with the new shape.

## 9.3 Classification (the graph) + sanity gate
Phase 1 of analysis: per sheet, a heuristic `inferSheetGraph()` always computes a column-role graph. An optional LLM graph (`CandidateSheetGraph`, §03.7) is `reconcileGraph`'d against the real columns (hallucinated columns dropped, omitted real ones back-filled). Its metrics are accepted **only if `metricsSane()`** passes vs the heuristic baseline — otherwise the golden-tested heuristic wins. → the user gets LLM understanding with **zero risk of injected random numbers**.

## 9.4 Narrative (prose)
The cockpit AI Executive Summary, Recommended Actions, and Ask RAS answers are LLM prose built from `narrativeContext` (§07.8) — never authoritative numbers; the numbers are passed in, already computed. Prompts built in `analysis-utils.ts`.

## 9.5 Ask RAS chat + provenance flyout
- `/chat` + `POST /api/chat`: NL Q&A over the ledger. Context = scoped events + computed metrics + provenance.
- Each answer carries a **[View Source]** flyout → stated metric, file source, worksheet, cell range, file MD5/SHA hash, timestamp, ledger id, and any **user edit comments** (`AnnotationEvent`s). This is the audit bridge: prose → exact physical origin.

## 9.6 De-identification (for any external AI — see [14](14-security-airgap.md))
Before a payload leaves the LAN, a local middleware pseudonymizes sensitive entities via a regex token map (`14 Fr … Operator Ramesh … Machine M3` → `[SKU-1] … [OPERATOR-1] … [MACHINE-1]`). Only scrubbed text is sent; the local server maps the structured response back to real entities before render.

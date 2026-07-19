# Known Issues & Optimizations — Performance Log
*June 2026 · planning reference · nothing here has been changed yet*

Prioritized list of what makes the chatbot and app feel slow, **where to look**, and the **preferred fix**. Severity: 🔴 high · 🟡 medium · 🟢 low.

---

## A. Chatbot latency

### A1 🔴 Non-streaming responses (biggest perceived-slowness factor)
- **Symptom:** the chat shows nothing until the entire answer is ready, then it appears all at once.
- **Root cause:** `src/app/api/chat/route.ts` uses `generateObject(...)` (and `generateText` fallback) — both **block until the full completion**. No token streaming.
- **Preferred fix:** stream the answer. Use AI SDK `streamText` (and `useChat`/`readStreamableValue` on the client in `src/app/chat/page.tsx`) so tokens render as they generate. Time-to-first-token drops from seconds to ~instant. Keep the structured "insight slide" only for when a chart is explicitly requested; default chat = streamed text.

### A2 🔴 Multi-tier fallback re-runs the whole provider cascade
- **Symptom:** some answers take many seconds or "AI service rate-limited".
- **Root cause:** `route.ts` tries **slide → text → rule-based**; each of the first two calls `tryModels`, which walks **Groq → NVIDIA → OpenRouter** sequentially on failure. Worst case ≈ 6 sequential cloud attempts. Structured-object (`generateObject`) also fails more often on weak free models, which *triggers* the text fallback → double latency.
- **Preferred fix:** (1) move to a **local LLM** (§D) — removes rate-limit cascades and WAN entirely; (2) make chat **text-first** (fast, reliable) and generate a chart spec only on demand; (3) shorten the fallback chain to one local call + one rule-based safety net.

### A3 🟡 Cloud free-tier providers (rate limits + network hops)
- **Root cause:** `src/lib/ai.ts` chain = Groq/NVIDIA/OpenRouter free tiers; queued/rate-limited and across the internet.
- **Preferred fix:** local Ollama as the primary backend (§D). Keep `tryModels` shape; just change the backend list.

### A4 🟡 Chat prompt context grows with the dataset
- **Root cause:** `buildChatContext()` stuffs all KPIs + **every** chart series + **every** per-sheet section + insights into one prompt. Fine now; grows with months/sheets → slower prompt processing.
- **Preferred fix:** pass only the **scope-relevant** computed metrics for the question (the numbers are already deterministic), and cap chat history. This stays "grounded/RAG-like" without ballooning the prompt.

---

## B. App "feels slow"

### B1 🔴 Every screen ships the ENTIRE ledger to the client and recomputes
- **Symptom:** each page load is heavy; navigating between analytics screens re-does work.
- **Root cause:** all 11 screens `fetch("/api/events")` → receive the **full canonicalized event array** (~12k events with provenance) → run **all selectors client-side** in `useMemo` (`src/app/page.tsx` and siblings). Big payload + repeated client compute.
- **Preferred fix:** compute selectors **server-side** and return small **view-models** (KPIs, chart series, tables) per scope — not the raw ledger. The frontend renders results instead of recomputing. (This is also the right boundary for the future Python/FastAPI split — one source of truth for the math.)

### B2 🔴 `canonicalizeEvents` runs on every `/api/events` request (no cache)
- **Root cause:** `src/app/api/events/route.ts` calls `canonicalizeEvents(await events.effective(filter))` on **every** request; recomputed for every screen, every reload.
- **Preferred fix:** **cache** the canonicalized result in memory keyed by a store version/hash; invalidate on `append`/`hard-reset`. Canonicalization then runs once per data change, not once per request. Add `Cache-Control`/SWR on the client so 11 screens don't each re-fetch.

### B3 🟡 Cloud Supabase round-trip on every read
- **Root cause:** `getStores()` → Supabase over WAN for each `/api/events`.
- **Preferred fix:** on-prem **local Postgres** removes WAN latency; combined with B2 caching, reads become near-instant.

### B4 🟡 Serverless cold starts
- **Root cause:** Vercel functions spin up on first hit (and the old seed-on-first-request added more).
- **Preferred fix:** on-prem = a persistent Node process (`next start` behind Nginx) → no cold starts.

### B5 🟢 `sourceEventIds` arrays are large
- **Root cause:** `analytics/rejection.ts` `ids()` builds multi-thousand-entry eventId arrays inside every `MetricValue` (for verify-mode provenance). Pure client CPU/memory cost.
- **Preferred fix:** compute `sourceEventIds` **only on demand** (when the user opens verify/provenance), or cap them; don't build them for every KPI on every render.

---

## C. Net effect / sequencing
Most of this is **architecture + cloud**, not the language. Order of impact:
1. **Go on-prem with a local LLM** → fixes A2/A3 (chat) and B3/B4 (app) at once, and makes it private.
2. **Stream chat (A1) + text-first (A2)** → chat feels instant.
3. **Server-side view-models (B1) + cache canonicalization (B2)** → app feels instant.
4. Trim context (A4) and lazy `sourceEventIds` (B5) → polish.

None require switching to Python; all are compatible with both the current TS stack and a future FastAPI port.

---

## D. Local LLM choice (for §A fixes)
Right-size: the model only does **structured JSON classification** + **grounded narration/Q&A** (numbers are pre-computed). A 7B–14B model suffices; a CAD-workstation GPU is plenty.
- **Default:** **Qwen2.5-7B-Instruct** (best structured-output reliability at this size; ~5–6 GB VRAM @ Q4_K_M; CPU fallback works).
- **If GPU ≥12 GB & you want sharper prose:** **Qwen2.5-14B-Instruct** or **Gemma 3 12B** (comparable; A/B test on your sheets). **Gemma 3 4B** = a faster, lighter option. *(Note: there is no "Gemma 4" as of now — Gemma 3 is the current line.)*
- **Safe/standard:** **Llama 3.1 8B Instruct** (canonical-spec pick).
- Serve via **Ollama** (CPU+GPU auto-offload, GGUF Q4_K_M). Use Ollama JSON-schema/`format:json` for the classification call (replaces `generateObject`). Switch to **vLLM** later if multi-user throughput is needed.

---

## E. RAG clarification (answering "doesn't it already retrieve?")
The chat **is grounded** — `buildChatContext()` injects the deterministically-computed metrics into the prompt, and the system prompt forbids inventing numbers. But this is **context-stuffing, not vector RAG** (no embeddings, no similarity retrieval).
- For **structured numeric** Q&A this is the **correct** design — deterministic filtering of the event ledger beats embeddings for numbers.
- **Vector embeddings** (e.g. `nomic-embed-text`, `bge-small`) are only worth adding if you later want **semantic search over unstructured text**: SOPs, CAPA notes, operator comments, past chat. Not needed for the numbers.
- If/when added: embed only the unstructured corpus, retrieve top-k by meaning, and keep the numeric answers on the deterministic path. (Hybrid: structured retrieval for figures + vector retrieval for documents.)

# MO!D — Finalized Security, Deployment & Data-Egress Spec (v1)

**Status:** FINAL for build · 2026-06-17 · Architecture (my domain). Supersedes `docs/cybersecurity-and-network-blueprint.md` (kept as background).
**Companion:** [`MOID-SPEC.md`](MOID-SPEC.md) §11 (architecture), [`MOID-DESIGN-SPEC.md`](MOID-DESIGN-SPEC.md).
**Purpose:** answer "desktop or web? what stack? do API calls leak data? how do we pass their IT review and get the firewall exception?" — with a design that is safe **by construction**, not by promise.

---

## 1. Client constraints & threat model

Disposafe is a medical-device plant with a hardened, IP-sensitive environment:
- **Air-gapped-ish LAN:** DNS sinkholes block public websites; outbound internet is denied by default; RF jammers (irrelevant to wired LAN — noted only to confirm we must not depend on cellular/wifi egress).
- **Sensitive assets that must never leak:** latex compounding formulas, true production rates/volumes, operator and machine identities, SKU economics, batch numbers.
- **Regulated:** ISO 13485 + CDSCO MDR-2017; data-integrity expectations are ALCOA+ and 21 CFR Part 11.
- **They *can* grant a narrow firewall exception** for our API calls — **if** we prove the traffic is safe and non-leaking.

**What we are defending:** (a) no proprietary data egress to any third party, including the LLM provider; (b) tamper-evident, attributable records for audits; (c) the plant stays in control of every byte that leaves the LAN.

## 2. Deployment model — DECISION

**Build it as a self-hosted, on-prem WEB APP — not a cloud SaaS, not a per-PC desktop app.**

- **Runs inside the factory LAN** on one local server/mini-PC. Shopfloor/office browsers reach it over LAN (`https://moid.local`), TLS via a cert added to the factory CA. Zero dependency on the public internet to function.
- **Why not cloud SaaS:** the LAN can't reach Vercel; a cloud-hosted app is dead on arrival here, and shipping their data out is the exact thing they fear.
- **Why not an Electron/Tauri desktop app:** the product is inherently multi-user (steward enters/adjudicates, GM views, shared immutable ledger + rulebook). That wants a shared server, not N desktop copies with sync headaches. (A thin desktop *shortcut/kiosk wrapper* pointing at the LAN URL is fine if they want an "app icon," but the engine is the on-prem server.)
- **Distribution:** a Docker image (or a `next build` standalone bundle + Postgres) the plant's IT runs on the local box. One command up. Updates = new image, offline-installable.

This is the cybersecurity blueprint's "Option A" topology, made the default.

## 3. The LLM Data-Egress Contract (the heart of it)

**Principle: the LLM is a structure/prose assistant, never a data processor.** This is already baked into MOID-SPEC §2 ("model never does arithmetic") — here we harden it into an enforced egress contract.

**What the LLM is used for (only two seams):**
1. **Classification** — map messy column headers / sheet structure → roles (stage/defect/date/qty). Input it needs: *header text and shape*, not the numbers under them.
2. **Narrative** — write plain-language insights/recommendations from **already-computed, de-identified** figures.

**What may EVER leave the box to an LLM (allow-list):**
- Column header strings and table structure (row/col positions), with client-identifying tokens pseudonymized.
- **Aggregated, de-identified statistics only** — percentages, ranks, trends ("stage A rejection 9.6%, up 1.2pp"). Never raw counts/volumes.
- Defect *category names* (generic: "Thin Spot", "Leakage") — these are industry-standard, not proprietary.

**What must NEVER leave the box (deny-list, enforced):**
- Raw quantities (checked/rejected counts, batch volumes), batch numbers, operator/machine IDs, SKU codes & economics, cost/₹ figures, file names/hashes, the raw workbook bytes.

**Two enforcement layers (defense in depth):**
- **Structural:** prompts are built by dedicated builders that accept only the allow-listed fields. There is no code path that puts a raw quantity into a prompt — the compute layer and the LLM layer don't share inputs.
- **Scrubber gate:** every outbound LLM payload passes through a **pseudonymization scrubber** (reversible map kept *local only*): SKU/operator/machine/batch tokens → `[ID-n]`; raw numbers → percentages or `[N]`. The LLM's response is de-tokenized locally. (Implements the blueprint's `DataScrubber`.)

## 4. Two operating modes (set at deploy time)

**Mode A — Fully local (default, zero egress).** LLM runs on the LAN via **Ollama/vLLM** (e.g. a Llama-3-8B-class model) on the local box or a small GPU. `getModel()` points at `http://<lan-ip>:11434`. **No packet ever leaves the LAN.** Works today with no firewall change. This is what we demo and ship first.

**Mode B — Scrubbed cloud fallback (opt-in, needs the exception).** When the plant grants the narrow exception and wants stronger models, outbound LLM calls go **only** through the egress gateway (§5) to a **single whitelisted endpoint**, carrying only scrubbed allow-listed content, with `no-training`/zero-retention flags set. Toggled per-deployment; off by default. Everything else (ingest, compute, store, validation, reports) is 100% local in both modes.

The existing `tryModels` provider chain (`src/lib/ai.ts`) is extended: local provider first; cloud providers are reachable only via the egress guard and only in Mode B.

## 5. Egress guard — implementation plan

A single chokepoint every outbound request passes through (no other code may call `fetch` to an LLM):
1. **Allowlist:** one configured destination host; everything else hard-fails closed. (Pairs with the plant's Nginx/Squid forward-proxy whitelist + DNS rule.)
2. **Scrubber:** applies §3 pseudonymization; rejects the call if any deny-listed pattern survives (fail closed, not fail open).
3. **Outbound audit log:** every call writes a local, immutable record — timestamp, destination, the **exact scrubbed payload sent**, and the hash. This is the evidence trail.
4. **Dry-run / preview:** a mode that shows IT *exactly* what a real call would send (the scrubbed payload) without sending it — so they can inspect before granting access.
5. **No-retention headers:** sets the provider's zero-data-retention / disable-training flags on every Mode-B call.

## 6. Compliance mapping (for the regulatory side of the review)

| Requirement | How MO!D satisfies it |
|---|---|
| **Original (ALCOA+)** | Raw uploaded workbook bytes stored content-addressed, unmodified; analytics run on derived events. |
| **Attributable** | Every entry/adjudication carries the acting user + timestamp (events + annotations). |
| **Contemporaneous** | `recordedAt` stamped server-side at write. |
| **Accurate / Legible** | Deterministic recompute of every claimed total/%; discrepancies become Findings, never silent edits; typography floors. |
| **Plus = Integrity (21 CFR Part 11)** | Append-only ledger; no UPDATE/DELETE on events/findings; corrections *supersede* with an adjudication reference; row + file hashes; one-click audit ZIP with SHA-256 manifest. |
| **Data residency** | All proprietary data stays on the LAN (Mode A = always; Mode B = only scrubbed aggregates leave). |
| **Access trail** | Local audit log of read/write + every outbound LLM payload (§5.3). |

## 7. The "get us unblocked" package (what to hand their IT/security team)

A short, concrete dossier so the exception is an easy yes:
1. **Data-flow diagram** (LAN-only by default; Mode-B path = single host, scrubbed).
2. **Egress allowlist profile** — exact destination host, port 443, protocol; "deny all else."
3. **Sample scrubbed payloads** from the dry-run (§5.4) — show them the literal bytes: headers + percentages + `[ID-n]` tokens, zero raw data.
4. **The deny-list** + the fail-closed guarantee (scrubber blocks the call if anything sensitive survives).
5. **Outbound audit log** sample — they can review every call after the fact.
6. **Provider zero-retention/no-training** contractual flag evidence.
7. **Offer Mode A** as the fallback: "if you grant nothing, the product still fully works, fully local." This reframes the exception as an *optional upgrade*, not a dependency — the strongest negotiating position.

## 8. Finalized tech stack (security-aligned)

- **App:** Next.js 16 + React 19 (existing), built **standalone**; served on-prem (Docker or `next start`) — same codebase, self-hosted.
- **Parsing:** SheetJS **client-side** (already true) — raw workbook never needs to hit a server to be read; another egress reducer.
- **DB:** Postgres on the LAN — **self-hosted Supabase** (keeps the existing `@supabase/supabase-js` code) or plain Postgres behind the same `store/` interface. Append-only constraints per MOID-SPEC §11.
- **LLM:** **Ollama/vLLM local** (Mode A default) via the AI SDK's OpenAI-compatible local endpoint; cloud providers only behind the egress guard (Mode B). Extend `src/lib/ai.ts tryModels` accordingly.
- **TLS on LAN:** factory-CA-signed cert for `https://moid.local`.
- **No new outbound dependencies** added casually (per AGENTS.md). Archiver for the audit ZIP is local-only.

## 9. Impact on the codebase (build tasks)

- `src/lib/ai.ts`: add a **local provider as default**, and route all cloud calls through a new **egress guard** module; no direct LLM `fetch` elsewhere.
- `src/lib/security/scrubber.ts`: pseudonymization + de-tokenize + deny-list verifier (fail-closed).
- `src/lib/security/egress-log.ts`: append-only outbound audit log (+ dry-run preview).
- Prompt builders (`analysis-utils`): assert allow-listed inputs only; add a unit test that **no raw quantity/identifier can reach a prompt** (guard test).
- Deployment: Dockerfile + on-prem run docs; env flag `MOID_LLM_MODE = local | scrubbed-cloud`.

## 10. Open questions (client/IT)

1. **Local LLM box?** A small GPU (~₹80k–1L, one-time) enables Mode A with good models. Confirm they'll provision one, or we run a smaller CPU model locally / lean on Mode B.
2. Which single cloud endpoint (if Mode B) — our AI Gateway host vs a specific provider — to put on their allowlist.
3. Who is the IT/security approver, and do they want the dossier (§7) before or at the pilot meeting?
4. On-prem box specs & who operates it (their IT vs us managed).

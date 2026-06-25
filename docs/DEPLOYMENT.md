# RAIS / MO!D — On-Prem Appliance Deployment Guide

This is how you ship RAIS to a customer's shop floor as a **sealed appliance**:
one box, one `docker compose up`, no inbound internet, no source code handed
over, and the LLM running locally so no plant data ever leaves the building.

> **Status.** Stage A (packaging + this guide) is done. Stage B (swap Supabase →
> Postgres, add the Ollama backend, generate `db/init.sql`) is the remaining code
> migration that makes the app actually talk to the local Postgres + Ollama
> containers. Until Stage B lands, the containers below are the *target*; the app
> still expects Supabase/Groq. See "Remaining work (Stage B)" at the end.

---

## 1. The big picture

Everything runs in Docker on **one machine** on the plant's LAN. Only the
reverse proxy is reachable from the network; everything else talks over a
private Docker network.

```
   Plant LAN  ──HTTPS──►  ┌──────────── the appliance box ────────────┐
   (operators'            │                                            │
    browsers)             │   caddy  (TLS, :443)   ← only public port   │
                          │     │                                       │
                          │     ▼                                       │
                          │   app   (Next.js standalone, :3000 internal)│
                          │     ├──► db      (Postgres, quality data)    │
                          │     └──► ollama  (local LLM, no internet)    │
                          │                                            │
                          │   (no inbound internet required at all)     │
                          └────────────────────────────────────────────┘
```

**Why this shape:**
- **Single attack surface.** Only Caddy publishes ports (80/443). The app, DB,
  and LLM are not reachable from the LAN directly.
- **Air-gapped by default.** No service needs outbound internet. The LLM is
  local, so quality data, batch numbers, and operator names never leave the box.
- **Their data on their disk.** Postgres writes to a Docker volume on the
  appliance — you never hold their data.
- **Trivial install/upgrade.** Load images, set one `.env`, `docker compose up`.

---

## 2. How each component works

### Caddy (reverse proxy + TLS) — `Caddyfile`
The front door. It terminates HTTPS and forwards requests to the app over the
private network. We use Caddy's **internal CA** (`tls internal`) so you get real
TLS even with no public DNS and no internet — Caddy mints its own certificate.
Operators trust Caddy's root certificate **once** (it lives in the `caddy_data`
volume at `/data/caddy/pki/authorities/local/root.crt`); after that the browser
padlock is green. Plain HTTP is redirected to HTTPS.

### app (Next.js standalone) — `Dockerfile`
Your application and analysis engine. We build with `output: "standalone"`
(`next.config.ts`), which produces a self-contained `server.js` plus only the
node modules it actually uses. The shipped image contains **only that minified
bundle** — no `src/`, no TypeScript, no comments. It listens on `:3000` inside
the network; Caddy is the only thing that can reach it.

### db (Postgres) — compose service `db`
The canonical event ledger and registry live here. On **first** boot (empty data
dir) Postgres auto-runs `db/init.sql` to create the schema. Data persists in the
`pgdata` volume across restarts and upgrades. This replaces hosted Supabase —
same Postgres underneath, minus the extra Supabase services, which shrinks the
footprint and attack surface for a single-tenant on-prem box.

### ollama (local LLM) — compose service `ollama`
Runs the language model **on the box**. The app calls it at
`http://ollama:11434`. Model weights persist in the `ollama_models` volume. This
is what makes the AI features work with **zero egress** — nothing is sent to any
cloud provider. CPU is fine for a small model (`qwen2.5:3b`); a GPU lets you run
a larger, more accurate model.

---

## 3. Prerequisites (the appliance box)

- 64-bit Linux host (Ubuntu Server LTS is a good default) with **Docker Engine +
  Docker Compose v2**.
- CPU-only baseline: **8 GB RAM, 4 cores, ~30 GB disk** (more for model + data).
- Optional GPU: NVIDIA card + `nvidia-container-toolkit` for the larger model.
- No internet needed at runtime. (You only need internet **once, on your build
  machine**, to build images and pull `postgres`/`caddy`/`ollama` base images —
  then you transfer them offline.)

---

## 4. Build & ship (you, on your machine)

You build images where you have internet and the source, then move them as files.

```bash
# 1. Build the app image (source stays on your machine; image has only the bundle)
docker compose build app          # produces rais-app:latest

# 2. Pull the third-party images you'll ship alongside it
docker pull postgres:16-alpine
docker pull caddy:2-alpine
docker pull ollama/ollama:latest

# 3. Save everything to a single tarball for offline transfer
docker save rais-app:latest postgres:16-alpine caddy:2-alpine ollama/ollama:latest \
  | gzip > rais-appliance-$(date +%Y%m%d).tar.gz

# 4. (Optional but recommended) pre-pull the LLM weights so the plant box never
#    needs internet. Easiest: pull on a temporary ollama container, then copy the
#    ollama volume — OR just pull on first boot if the box has a one-time window.
```

Ship to the customer: the **tarball**, `docker-compose.yml`, `Caddyfile`,
`.env.template`, and (Stage B) `db/init.sql`. **Never** ship the repo.

---

## 5. Install runbook (on the plant box)

```bash
# 1. Load the images from the tarball
gunzip -c rais-appliance-YYYYMMDD.tar.gz | docker load

# 2. Configure
cp .env.template .env
#   edit .env: set a strong POSTGRES_PASSWORD (and the matching DATABASE_URL),
#   set APP_DOMAIN if you have one, confirm RAIS_AI_BACKEND=ollama.

# 3. Start everything
docker compose up -d

# 4. Pull the local model (one time; needs the model present in the ollama volume)
docker compose exec ollama ollama pull qwen2.5:3b

# 5. Verify
docker compose ps                 # all services "healthy"/"running"
docker compose logs -f app        # watch for "Ready"

# 6. Use it
#   Browse to  https://<box-ip>/   (or https://APP_DOMAIN/)
#   First visit: trust Caddy's root CA once (see §2 Caddy) to clear the warning.
```

That is the entire install. Hand the customer §5 as a one-pager.

---

## 6. Updating

You ship a new tarball; they reload and restart. Data in `pgdata` is preserved.

```bash
# on your machine
docker compose build app
docker save rais-app:latest | gzip > rais-app-vNEXT.tar.gz

# on the plant box
gunzip -c rais-app-vNEXT.tar.gz | docker load
docker compose up -d app          # recreates only the app container
```

Schema changes ship as additional, forward-only SQL the app applies on boot (or
that you run once via `docker compose exec db psql`). Keep migrations idempotent.

---

## 7. Backups & restore

The only stateful things are the `pgdata` and `ollama_models` volumes. Back up
the database on a schedule (cron on the host):

```bash
# Backup (writes a timestamped dump to ./backups on the host)
docker compose exec -T db pg_dump -U rais rais | gzip > backups/rais-$(date +%F).sql.gz

# Restore (into a fresh/empty DB)
gunzip -c backups/rais-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U rais -d rais
```

Also export the audit package from the app UI periodically — that's an
independent, signed CSV/manifest snapshot.

---

## 8. Security model

- **No inbound internet.** Nothing in the stack requires it. Put the box on the
  LAN; expose only 443 (and 80→443 redirect) via Caddy.
- **No outbound by default.** `RAIS_AI_BACKEND=ollama` and no cloud keys means no
  egress. If the customer ever grants a firewall exception for a cloud LLM, it
  must go through the fail-closed egress guard + scrubber (per the security spec)
  — the model only ever sees column structure + de-identified aggregates, never
  raw counts/batch/operator.
- **TLS on the LAN** via Caddy's internal CA.
- **Least privilege:** the app runs as a non-root user inside the container; only
  Caddy publishes ports; services talk over a private bridge network.
- **Secrets** live in `.env` on the box, never in an image layer (`.dockerignore`
  excludes `.env`).
- **Auth (recommended next):** the app currently has a placeholder user. For
  shop-floor use add a real login (hashed credentials, operator vs. QM roles)
  even though it's LAN-only. Tracked as a follow-up.

---

## 9. Source / IP protection — what's realistic

**Honest framing:** code that runs on hardware you don't control can, in
principle, be reverse-engineered by someone with admin rights. You cannot make
that impossible. The goal is to make casual copying impossible and serious
theft slow, skilled, and legally radioactive. Layers, strongest first:

| Tier | What | Status |
|------|------|--------|
| 0 — **Ship only the build** | `output: "standalone"` + multi-stage Dockerfile: the image has only minified/bundled JS, no `src/`, no TS, no comments. Crown-jewel logic (metrics, dashboard-builder, prompts) runs **server-side only** — never in the browser bundle. | ✅ done (this stage) |
| 1 — **Byte-compile the engine** | Extract the few genuinely-proprietary modules (`metrics.ts`, `dashboard-builder.ts`, prompt builders) into an *externalised* module compiled to V8 bytecode (`bytenode` → `.jsc`) or a small compiled sidecar (Go/Rust) called over localhost. Native binary = the biggest single jump in protection. | ⏳ planned |
| 2 — **License + tamper** | Signed, node-locked license file (bind to machine fingerprint, optional expiry); app refuses to boot without it. Stops appliance cloning / post-contract use. | ⏳ planned |
| 3 — **Legal** | License agreement / NDA with no-decompile + no-redistribution clauses. For a regulated medical customer this is often the strongest real deterrent. | 📋 your call |

> **Why not just obfuscate the JS?** JS obfuscators wreck debuggability and
> performance for marginal gain over minified-standalone + bytecode. Skip them.

> **Bytenode caveat (important).** Next.js bundles server code into chunks, so
> you can't naively byte-compile one source file — `metrics.ts` may be inlined
> into a route chunk. The reliable pattern is to **externalise** the engine
> (mark it in `serverExternalPackages`, which is why `next.config.ts` already
> lists externals) so it loads from `node_modules` at runtime, then byte-compile
> *that* module and ship the `.jsc`. That's the Tier-1 task.

**Recommended posture:** Tier 0 (done) + Tier 1 (bytecode the engine) + Tier 2
(license key) + Tier 3 (contract). Proportionate and strong.

---

## 10. Remaining work (Stage B — the code migration)

To make the appliance actually run against the local containers above:

1. **Postgres data layer.** Replace the 14 Supabase touch-points (`src/lib/store/*`
   + the 12 API routes using `createServerClient`) with a small `pg`-backed
   `src/lib/db/` module behind the existing `store` seam. Add `pg` to deps.
2. **`db/init.sql`.** Consolidate the current `supabase/migrations/*` into one
   plain-Postgres schema (drop Supabase RLS/roles; this is single-tenant on-prem)
   incl. the new `registries.sizes` column. Mounted by the `db` service on first
   boot.
3. **Ollama backend in `src/lib/ai.ts`.** Add an `ollama` backend
   (OpenAI-compatible at `OLLAMA_BASE_URL`) and make it the default so
   `RAIS_AI_BACKEND=ollama` works; keep cloud backends behind the fail-closed
   egress guard.
4. **Tier-1 source hardening.** Externalise + byte-compile the engine modules.

These are executed as a reviewed, test-verified phase (see the plan in
`docs/superpowers/plans/`).

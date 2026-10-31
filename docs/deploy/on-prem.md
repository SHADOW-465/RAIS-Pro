# MOID on-prem plant appliance

Runbook for the **first real plant install**, based on the deployment choices locked for this kit:

| Decision | Choice |
|----------|--------|
| Topology | **Single Linux server** on the plant LAN |
| Packaging | **Docker Compose appliance** (app + Postgres + PostgREST + nginx) |
| Network | **Air-gapped** — no outbound internet required at runtime |
| AI | **Optional** local OpenAI-compatible LLM (MiniCPM / Ollama / vLLM) |
| Access | **LAN + reverse proxy + strong DB secrets**; application login stays as-is for pilot |
| Ops in this kit | **Install · upgrade · backup · restore** |

This is not a cloud SaaS guide. It installs a **self-contained box** operators reach over the factory network.

---

## 1. What you get

```
 Plant LAN browsers
        │
        ▼
 ┌──────────────────────────────────────────┐
 │  Linux server (Docker)                   │
 │                                          │
 │   nginx :80  ──►  Next.js app            │
 │       │                                  │
 │       └── /rest/v1 ──► PostgREST ──► Postgres (volume) │
 │                                          │
 │   optional: local LLM on host or LAN     │
 └──────────────────────────────────────────┘
```

| Component | Role |
|-----------|------|
| **gateway** (nginx) | Only published port; serves UI + `/rest/v1` |
| **app** | MOID Next.js (`next start` / standalone) |
| **rest** | PostgREST — API shape expected by the existing Supabase client |
| **db** | Postgres 17; data in Docker volume `moid_pgdata` |
| **migrate** | One-shot job; applies `supabase/migrations/*.sql` |

Postgres is **not** exposed on the host network by default.

---

## 2. Prerequisites

### Server

- Linux (x86_64 recommended)
- Docker Engine + Docker Compose v2 plugin
- **4–8 vCPU, 16–32 GB RAM, SSD** (starting point; size with plant IT)
- Disk for: images, DB volume, backup directory (prefer a second disk or NAS mount for backups)

### Network

- Static LAN IP or internal DNS name for the server
- Operators open `http://<that-host>/` (port **80** by default)
- **No internet required** after images are present on the machine
- Do not put this gateway on the public internet

### Air-gap image load

On a connected build machine:

```bash
# From a machine that can pull images + build
docker pull postgres:17-alpine
docker pull postgrest/postgrest:v12.2.8
docker pull nginx:1.27-alpine
docker build -f deploy/Dockerfile -t moid-app:local \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=http://PLACEHOLDER \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder \
  .

docker save postgres:17-alpine postgrest/postgrest:v12.2.8 \
  nginx:1.27-alpine moid-app:local \
  | gzip > moid-images.tar.gz
```

On the plant server (USB/offline transfer):

```bash
gunzip -c moid-images.tar.gz | docker load
```

You will **rebuild** `moid-app` on the plant (or rebuild offline with the real LAN URL) so `NEXT_PUBLIC_SUPABASE_URL` matches the plant address — that value is baked into the browser bundle.

---

## 3. Files in this kit

```
deploy/
  docker-compose.yml
  Dockerfile
  env.example          → copy to deploy/.env
  nginx/nginx.conf
  db/00_init_roles.sql
  scripts/
    gen-secrets.sh
    install.sh
    upgrade.sh
    backup.sh
    restore.sh
    migrate.sh
supabase/migrations/   # applied by migrate job
docs/deploy/on-prem.md # this file
```

---

## 4. First install

On the plant server, from a checkout (or extract) of the release that includes `deploy/` and `supabase/migrations/`:

```bash
cd deploy
cp env.example .env
./scripts/gen-secrets.sh
```

Edit `.env`:

1. **`NEXT_PUBLIC_SUPABASE_URL`** — exact base URL operators will use  
   Examples: `http://10.0.0.50` or `http://moid.plant.local`  
   No trailing slash. Same host/port as the gateway.
2. Leave secrets from `gen-secrets.sh` as generated (do not reuse laptop demo JWTs).
3. Optional: `MINICPM_BASE_URL` if a local LLM is already reachable.
4. Optional: `MOID_HTTP_PORT` if 80 is taken (then put that port in the public URL).

```bash
chmod +x scripts/*.sh
./scripts/install.sh
```

What install does:

1. Builds `moid-app` with the public URL + anon key  
2. Starts `db`, `rest`, `app`, `gateway`  
3. Runs migrations  
4. Restarts PostgREST so DB role passwords match  
5. Waits for `GET /healthz`

Smoke checks:

```bash
curl -sf http://127.0.0.1/healthz && echo OK
# From an operator PC on the LAN:
# open http://<plant-host>/
```

Configure schema via the product UI (Staging / Data Schema) — production seed data stays **off**.

---

## 5. Air-gap operating rules

| Rule | Detail |
|------|--------|
| Runtime egress | Not required. Do not open outbound for “convenience.” |
| Image updates | Build/pull elsewhere → `docker load` on plant → `./scripts/upgrade.sh` |
| Cloud AI keys | **Do not set** `GROQ_API_KEY` (or other cloud keys) on plant `.env` |
| Local LLM | Optional; if absent, analytics/entry/ledger still work; chat / assisted features degrade |
| Secrets | `deploy/.env` is root-readable only (`chmod 600 .env`); never commit it |

---

## 6. Optional local LLM

Deterministic KPIs **never** come from the model. AI is only for classification assist and prose.

If the plant has a local OpenAI-compatible server:

```env
MINICPM_BASE_URL=http://172.17.0.1:8000/v1
MINICPM_API_KEY=local
RAIS_AI_BACKEND=minicpm
```

Notes:

- From inside the `app` container, `172.17.0.1` is often the Docker host (Linux). Prefer a stable LAN IP of the GPU box if unsure.
- If you add an Ollama/vLLM **compose service** later, put it on `moid_internal` and set `MINICPM_BASE_URL=http://llm:11434/v1` (or the service name you choose).
- After changing LLM env: `docker compose up -d app`

If `MINICPM_BASE_URL` is empty, the appliance is still valid for pilot entry and analytics.

---

## 7. Security posture (pilot)

**In this kit**

- Single published HTTP port (gateway)
- Postgres only on the internal Docker network
- Generated JWT secret + DB passwords (not Supabase demo keys)
- `server_tokens off` / no powered-by on the app
- **Optional app sign-in** via `MOID_AUTH_SECRET` (same as Vercel). When set, `/login` shows the three topbar roles (GM / Owner / Operator); pick one and enter its password. Defaults: `moid-gm` / `moid-owner` / `moid-operator`. When unset, open app + free topbar role switcher.

**Explicitly not in this kit (pilot)**

- SSO / corporate IdP  
- TLS termination (add plant IT certificate on nginx or an upstream proxy when ready)  
- Postgres RLS persona policies beyond existing service-role patterns  

### Moving Data Entry between databases

1. On source: **Data Entry → Export for transfer** → download JSON.  
2. On target: **Staging → Import transfer package** → drop the same file.  
3. Events append idempotently (same `eventId` is skipped). Works local ↔ plant ↔ Vercel as long as both point at their own stores.

**Plant IT should still**

- Restrict LAN access (mgmt VLAN / firewall to the server IP)
- Limit who can SSH to the host
- Own backup storage and restore drills
- Treat the host as a production system (patch OS offline or via approved channel)

When TLS is required, terminate on nginx (or a plant reverse proxy in front) and set `NEXT_PUBLIC_SUPABASE_URL` to `https://…`, then rebuild the app image.

---

## 8. Upgrade

```bash
cd deploy
# 1) backup first
./scripts/backup.sh

# 2) replace code/migrations with the new release (git pull, rsync, or offline bundle)

# 3) rebuild + migrate + restart
./scripts/upgrade.sh
```

If the plant LAN URL changed, update `NEXT_PUBLIC_SUPABASE_URL` in `.env` and rebuild (upgrade script rebuilds the app).

---

## 9. Backup

```bash
cd deploy
./scripts/backup.sh
# → deploy/backups/moid-pg-<UTC timestamp>.sql.gz
```

Recommended:

- Cron daily on the host (example: `15 2 * * * /opt/moid/deploy/scripts/backup.sh`)
- Copy dumps to **off-box** storage (NAS / tape / IT backup)
- Keep at least 14 days (`BACKUP_KEEP`)
- Quarterly: run restore on a **non-production** clone or after hours with approval

---

## 10. Restore

**Destructive** to the live database.

```bash
cd deploy
./scripts/restore.sh backups/moid-pg-YYYYMMDDTHHMMSSZ.sql.gz
# confirm by typing: RESTORE
```

After restore, verify a known batch and a dashboard KPI against a trusted month.

---

## 11. Day-2 commands

```bash
cd deploy
docker compose ps
docker compose logs -f app gateway
docker compose restart app

# Re-run migrations only
docker compose --profile tools run --rm migrate
```

Data volume name: `moid-plant_moid_pgdata` (project name `moid-plant`).  
Do not `docker compose down -v` on production — the `-v` flag deletes the ledger.

---

## 12. Acceptance checklist (install)

- [ ] `GET /healthz` returns `ok` on the server  
- [ ] Operator PC opens the public URL and loads the UI  
- [ ] Staging can accept a workbook (or Data Entry works once schema exists)  
- [ ] After ingest/entry, data survives `docker compose restart app`  
- [ ] `./scripts/backup.sh` produces a non-empty `.sql.gz`  
- [ ] `deploy/.env` is not world-readable and not in git  
- [ ] No cloud AI keys in plant `.env`  
- [ ] Named IT owner for host + backup path  

---

## 13. Out of scope for this kit (track separately)

- Multi-server / HA Postgres  
- Kubernetes  
- Full self-hosted Supabase Studio stack  
- Cloud-hosted pilot  
- Mandatory role login product work  
- Automated monitoring stack (Prometheus, etc.)  

Those can be layered later without changing the product ledger model.

---

## 14. Related product docs (background only)

Older architecture notes (not the install procedure):

- `docs/build-spec/14-security-airgap.md`
- `docs/build-spec/16-production-rebuild-guide.md`
- `docs/product-business/13-delivery-and-ops.md`

**This file + `deploy/` are the operational source of truth for the Compose appliance.**

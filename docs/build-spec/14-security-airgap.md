# 14 · Security & Air-Gapped Compliance

Goal: pass strict plant security audits — prevent data egress, survive DNS/domain blocks, protect proprietary compound ratios and batch counts.

## 14.1 Deployment posture
- **On-prem only**, on the plant LAN. No outbound internet by default.
- **Source files never edited:** uploads archived read-only to `/Uploads/Original/`; the app reads bytes, never writes back.
- **Local LLM** (Ollama) by default → no payload leaves the LAN at all.

## 14.2 Payload de-identification middleware (only if a cloud AI fallback is permitted)
A local middleware intercepts any payload before it leaves the LAN and pseudonymizes sensitive entities via a regex token map:
```
Raw:      "14 Fr Latex Foley Catheter had 450 Thin Spot rejects by Operator Ramesh on Machine M3"
Scrubbed: "[SKU-ID-1] had [COUNT-1] [DEFECT-1] rejects by [OPERATOR-1] on [MACHINE-1]"
```
Only scrubbed text is sent. The local server keeps the token↔entity map and re-substitutes real entities into the AI's structured response before render. Token classes: SKU-ID, COUNT, DEFECT, OPERATOR, MACHINE, BATCH.

## 14.3 Nginx forward proxy (whitelist egress)
The plant firewall routes outbound HTTPS through an Nginx proxy that whitelists ONLY the approved AI endpoint and 403s everything else:
```nginx
server {
  listen 8888;
  location /v1/chat/completions {
    resolver 1.1.1.1;
    proxy_pass https://api.nvcf.nvidia.com;   # or the approved endpoint
    proxy_set_header X-Real-IP "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header X-Disable-Telemetry "true";
  }
  location / { return 403; }
}
```

## 14.4 Access control
- Role-based: GM, Quality Manager, Supervisor, Operator. Postgres **RLS** per role on `events`/`findings`/`adjudications`.
- `is_direct_entry` + `provenance_*` columns enable per-row audit views.
- Adjudications carry `author` + `requiresGmAuthority`; intentional verdicts require a `why`.

## 14.5 Data integrity
- Append-only ledger + content-hash `eventId` = tamper-evident.
- `raw_files.file_bytes` + `provenance.fileHash` bind every number to the exact uploaded bytes.
- Audit ZIP SHA-256 manifest = exportable proof (ALCOA+).

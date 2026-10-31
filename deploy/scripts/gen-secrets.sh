#!/usr/bin/env bash
# Generate plant secrets into deploy/.env (creates from env.example if missing).
# Requires: openssl, node (for HS256 JWTs). No network.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
EXAMPLE="$ROOT/env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ ! -f "$EXAMPLE" ]]; then
    echo "Missing $EXAMPLE" >&2
    exit 1
  fi
  cp "$EXAMPLE" "$ENV_FILE"
  echo "[gen-secrets] created $ENV_FILE from env.example"
fi

rand_hex() { openssl rand -hex "${1:-32}"; }
# Alphanumeric only — safe in .env, shell `source`, and Postgres URIs.
rand_alnum() {
  # Avoid SIGPIPE under `set -o pipefail` from `head` closing the pipe early.
  openssl rand -hex 32
}

JWT_SECRET="${JWT_SECRET:-$(rand_hex 32)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(rand_alnum)}"
DB_AUTHENTICATOR_PASSWORD="${DB_AUTHENTICATOR_PASSWORD:-$(rand_alnum)}"
# App sign-in: the session signing key and the three preset-role passwords.
# There are no built-in defaults — the app refuses to start without the secret.
MOID_AUTH_SECRET="${MOID_AUTH_SECRET:-$(rand_hex 32)}"
MOID_AUTH_PASSWORD_GM="${MOID_AUTH_PASSWORD_GM:-$(rand_hex 8)}"
MOID_AUTH_PASSWORD_OWNER="${MOID_AUTH_PASSWORD_OWNER:-$(rand_hex 8)}"
MOID_AUTH_PASSWORD_OPERATOR="${MOID_AUTH_PASSWORD_OPERATOR:-$(rand_hex 8)}"

# Long-lived plant JWTs (10 years). Role claim is what PostgREST uses.
JWT_PAIR="$(node -e '
const crypto = require("crypto");
const secret = process.argv[1];
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
function sign(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = h + "." + p;
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return data + "." + sig;
}
const now = Math.floor(Date.now() / 1000);
const exp = now + 60 * 60 * 24 * 365 * 10;
const anon = sign({ role: "anon", iss: "moid-plant", iat: now, exp });
const svc = sign({ role: "service_role", iss: "moid-plant", iat: now, exp });
process.stdout.write(anon + "\n" + svc);
' "$JWT_SECRET")"
ANON_JWT="$(printf '%s\n' "$JWT_PAIR" | sed -n '1p')"
SERVICE_JWT="$(printf '%s\n' "$JWT_PAIR" | sed -n '2p')"
if [[ -z "$ANON_JWT" || -z "$SERVICE_JWT" ]]; then
  echo "[gen-secrets] failed to mint JWTs (is node installed?)" >&2
  exit 1
fi

upsert() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    local tmp
    tmp="$(mktemp)"
    # Do not split on '=' inside JWT values.
    awk -v k="$key" -v v="$val" '
      index($0, k "=") == 1 { print k "=" v; next }
      { print }
    ' "$ENV_FILE" >"$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >>"$ENV_FILE"
  fi
}

upsert JWT_SECRET "$JWT_SECRET"
upsert POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
upsert DB_AUTHENTICATOR_PASSWORD "$DB_AUTHENTICATOR_PASSWORD"
upsert NEXT_PUBLIC_SUPABASE_ANON_KEY "$ANON_JWT"
upsert SUPABASE_SERVICE_ROLE_KEY "$SERVICE_JWT"
upsert MOID_AUTH_SECRET "$MOID_AUTH_SECRET"
upsert MOID_AUTH_PASSWORD_GM "$MOID_AUTH_PASSWORD_GM"
upsert MOID_AUTH_PASSWORD_OWNER "$MOID_AUTH_PASSWORD_OWNER"
upsert MOID_AUTH_PASSWORD_OPERATOR "$MOID_AUTH_PASSWORD_OPERATOR"
echo "[gen-secrets] sign-in passwords for gm / owner / operator are in $ENV_FILE (MOID_AUTH_PASSWORD_*)"

echo "[gen-secrets] wrote JWT_SECRET, POSTGRES_PASSWORD, DB_AUTHENTICATOR_PASSWORD,"
echo "              NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY → $ENV_FILE"
echo "[gen-secrets] still set NEXT_PUBLIC_SUPABASE_URL to the plant LAN URL (e.g. http://10.0.0.50)"

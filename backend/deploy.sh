#!/usr/bin/env bash
# Deploy the backend to Google Cloud Run (project cs-407-agent).
#
# First time:  brew install --cask google-cloud-sdk && gcloud auth login
# Then, from the repo root:  bash backend/deploy.sh
#
# Secrets are read from the repo-root .env and tokens/app_*.json and stored in
# Secret Manager. Re-run this script any time to redeploy or update secrets.
set -euo pipefail

PROJECT="${GCP_PROJECT:-cs-407-agent}"
REGION="${GCP_REGION:-us-west1}"
SERVICE="${SERVICE_NAME:-cs314-agent-api}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

command -v gcloud >/dev/null || { echo "Install gcloud first: brew install --cask google-cloud-sdk"; exit 1; }
gcloud auth print-access-token >/dev/null 2>&1 || { echo "Run: gcloud auth login"; exit 1; }

env_value() {  # value of KEY from .env, quotes stripped; empty if missing
  [[ -f "$ENV_FILE" ]] || return 0
  { grep -E "^$1=" "$ENV_FILE" || true; } | tail -n1 | cut -d= -f2- | sed -e 's/[[:space:]]#.*$//' -e 's/[[:space:]]*$//' -e 's/^["'\'']//' -e 's/["'\'']$//'
}

# --- APP_API_TOKEN: the password the phone uses. Generated once, kept in .env.
APP_API_TOKEN="$(env_value APP_API_TOKEN)"
if [[ -z "$APP_API_TOKEN" ]]; then
  APP_API_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
  printf '\nAPP_API_TOKEN=%s\n' "$APP_API_TOKEN" >> "$ENV_FILE"
  echo "Generated APP_API_TOKEN and saved it to .env"
fi

ANTHROPIC_API_KEY="$(env_value ANTHROPIC_API_KEY)"
CANVAS_API_TOKEN="$(env_value CANVAS_API_TOKEN)"
CANVAS_BASE_URL="$(env_value CANVAS_BASE_URL)"; CANVAS_BASE_URL="${CANVAS_BASE_URL:-https://canvas.uoregon.edu}"
APP_TIMEZONE="$(env_value APP_TIMEZONE)"; APP_TIMEZONE="${APP_TIMEZONE:-America/Los_Angeles}"
GOOGLE_CALENDAR_IDS="$(env_value GOOGLE_CALENDAR_IDS)"; GOOGLE_CALENDAR_IDS="${GOOGLE_CALENDAR_IDS:-primary}"

[[ -n "$ANTHROPIC_API_KEY" ]] || echo "WARNING: ANTHROPIC_API_KEY missing in .env; chat will not work."
[[ -n "$CANVAS_API_TOKEN" ]] || echo "WARNING: CANVAS_API_TOKEN missing in .env; Canvas will not work."

# --- Google tokens: every tokens/app_<account>.json -> one JSON secret.
shopt -s nullglob
TOKEN_FILES=("$REPO_ROOT"/tokens/app_*.json)
[[ ${#TOKEN_FILES[@]} -gt 0 ]] || { echo "No tokens/app_*.json. Run backend/scripts/authorize_google.py first."; exit 1; }
GOOGLE_TOKENS_JSON="$(python3 - "${TOKEN_FILES[@]}" <<'PY'
import json, pathlib, sys
out = {pathlib.Path(p).stem[len("app_"):]: json.loads(pathlib.Path(p).read_text()) for p in sys.argv[1:]}
print(json.dumps(out))
PY
)"
GOOGLE_ACCOUNTS="$(python3 -c 'import json,sys; print(",".join(json.loads(sys.stdin.read())))' <<<"$GOOGLE_TOKENS_JSON")"

gcloud config set project "$PROJECT" >/dev/null
echo "Enabling APIs (first run takes a minute)..."
gcloud services enable run.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com gmail.googleapis.com calendar-json.googleapis.com >/dev/null

put_secret() {  # name, value (via stdin so it never shows in `ps`)
  local name="$1" value="$2"
  [[ -n "$value" ]] || value="unset"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy=automatic >/dev/null
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  echo "  secret $name updated"
}
echo "Updating secrets..."
put_secret app-api-token "$APP_API_TOKEN"
put_secret anthropic-api-key "$ANTHROPIC_API_KEY"
put_secret canvas-api-token "$CANVAS_API_TOKEN"
put_secret google-tokens-json "$GOOGLE_TOKENS_JSON"

# Cloud Run's default runtime identity needs to read those secrets.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for s in app-api-token anthropic-api-key canvas-api-token google-tokens-json; do
  gcloud secrets add-iam-policy-binding "$s" --member="serviceAccount:$RUNTIME_SA" \
    --role=roles/secretmanager.secretAccessor >/dev/null
done

# Newer projects don't let the default service account build from source; grant the
# role Google documents for `gcloud run deploy --source` (idempotent).
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$RUNTIME_SA" \
  --role=roles/run.builder --condition=None >/dev/null

echo "Deploying $SERVICE to $REGION..."
# The service is public at the network level; every /api route checks APP_API_TOKEN.
gcloud run deploy "$SERVICE" \
  --source "$REPO_ROOT/backend" \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 --memory 512Mi --timeout 120 \
  --set-env-vars "^@^GOOGLE_ACCOUNTS=$GOOGLE_ACCOUNTS@GOOGLE_CALENDAR_IDS=$GOOGLE_CALENDAR_IDS@CANVAS_BASE_URL=$CANVAS_BASE_URL@APP_TIMEZONE=$APP_TIMEZONE" \
  --set-secrets "APP_API_TOKEN=app-api-token:latest,ANTHROPIC_API_KEY=anthropic-api-key:latest,CANVAS_API_TOKEN=canvas-api-token:latest,GOOGLE_TOKENS_JSON=google-tokens-json:latest"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "Deployed: $URL"
curl -fsS "$URL/health" && echo
echo "In the app's Settings screen enter:"
echo "  Server URL: $URL"
echo "  API token:  (APP_API_TOKEN in .env)"

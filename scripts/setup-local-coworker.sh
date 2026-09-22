#!/usr/bin/env bash
# One-time local setup: vendor (optional), coworker, whitelist, coworker API key.
# Requires a platform admin user API key (see docs/COWORKER.md).
set -euo pipefail

API_URL="${SOKOSUMI_API_URL:-http://localhost:8787}"
API_URL="${API_URL%/}"
ADMIN_KEY="${SOKOSUMI_ADMIN_API_KEY:-}"

if [[ -z "$ADMIN_KEY" ]]; then
  echo "Set SOKOSUMI_ADMIN_API_KEY (user API key for a platform admin account)." >&2
  exit 1
fi

auth=( -H "Authorization: Bearer ${ADMIN_KEY}" -H "Content-Type: application/json" )

json_get() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('data',d).$1)" 2>/dev/null || true
}

VENDOR_ID="${VENDOR_ID:-}"
if [[ -z "$VENDOR_ID" ]]; then
  echo "Creating vendor news-catcher-local..."
  VENDOR_JSON=$(curl -sS -X POST "${API_URL}/v1/admin/vendors" "${auth[@]}" \
    -d '{"name":"News Catcher Local","slug":"news-catcher-local"}')
  VENDOR_ID=$(echo "$VENDOR_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
  echo "vendorId=$VENDOR_ID"
else
  echo "Using vendorId=$VENDOR_ID"
fi

echo "Creating coworker..."
COW_JSON=$(curl -sS -X POST "${API_URL}/v1/coworkers" "${auth[@]}" \
  -d "$(python3 - <<PY
import json
print(json.dumps({
  "vendorId": "$VENDOR_ID",
  "name": "News Catcher",
  "caption": "Topic news research (local)",
  "description": "Tasks-only coworker; hires the News catcher marketplace agent.",
  "capabilities": ["tasks"],
}))
PY
)")
COW_ID=$(echo "$COW_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
echo "coworkerId=$COW_ID"

echo "Whitelisting coworker..."
curl -sS -X PATCH "${API_URL}/v1/coworkers/${COW_ID}/whitelist" "${auth[@]}" \
  -d '{"isWhitelisted":true}' >/dev/null

echo "Creating coworker API key..."
KEY_JSON=$(curl -sS -X POST "${API_URL}/v1/coworkers/${COW_ID}/api-keys" "${auth[@]}" \
  -d '{"name":"local worker"}')
TOKEN=$(echo "$KEY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['token'])")

echo ""
echo "Add to agents/newscatcher/.env:"
echo "SOKOSUMI_API_URL=${API_URL}"
echo "SOKOSUMI_COWORKER_TOKEN=${TOKEN}"
echo "SOKOSUMI_NEWS_AGENT_ID=<your local News catcher agent id>"
echo ""
echo "Create tasks with coworkerId=${COW_ID} and status READY."

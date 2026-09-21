#!/usr/bin/env bash
set -euo pipefail

BASE="${AGENT_BASE_URL:-http://localhost:3040}"

echo "== availability =="
curl -sS "$BASE/availability" | jq .

echo "== input_schema (first field) =="
curl -sS "$BASE/input_schema" | jq '.input_data[0] // .'

echo "== start_job (free mode: anonymous purchaser) =="
JOB=$(curl -sS -X POST "$BASE/start_job" \
  -H 'Content-Type: application/json' \
  -d '{"identifier_from_purchaser":"anonymous","input_data":{"query":"Masumi Cardano","lang":"en","limit":2}}' \
  | tee /dev/stderr | jq -r '.job_id // empty')

if [[ -z "$JOB" ]]; then
  echo "start_job did not return job_id" >&2
  exit 1
fi

echo "job_id=$JOB"

for i in 1 2 3 4 5 6 7 8 9 10; do
  STATUS=$(curl -sS "$BASE/status?job_id=$JOB" | jq -r '.status')
  echo "poll $i: $STATUS"
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    curl -sS "$BASE/status?job_id=$JOB" | jq .
    exit 0
  fi
  sleep 2
done

echo "timed out waiting for job" >&2
exit 1

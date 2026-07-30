#!/usr/bin/env bash
# Posts one JSON payload file to OSLIFE's claude-chat-ingest edge function.
# Used by the oslife-remember skill — see ../SKILL.md for the payload shape
# and one-time setup (OSLIFE_CLAUDE_INGEST_SECRET).
set -euo pipefail

URL="${OSLIFE_CLAUDE_INGEST_URL:-https://nhyunnnmdcmojvkxrbpl.supabase.co/functions/v1/claude-chat-ingest}"

if [ -z "${OSLIFE_CLAUDE_INGEST_SECRET:-}" ]; then
  echo "OSLIFE_CLAUDE_INGEST_SECRET is not set. See ../SKILL.md for one-time setup." >&2
  exit 1
fi

if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  echo "Usage: log_to_oslife.sh <path-to-json-payload-file>" >&2
  exit 1
fi

http_code=$(curl -sS -o /tmp/oslife_remember_response.json -w '%{http_code}' -X POST "$URL" \
  -H "content-type: application/json" \
  -H "x-webhook-secret: $OSLIFE_CLAUDE_INGEST_SECRET" \
  --data @"$1")

body="$(cat /tmp/oslife_remember_response.json)"
rm -f /tmp/oslife_remember_response.json

echo "$body"

if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
  exit 1
fi

#!/usr/bin/env sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <server-id> <jwt-token>" >&2
  exit 1
fi

API_URL="${API_URL:-http://localhost:4000}"
curl --fail-with-body -X POST "$API_URL/v1/servers/$1/backups" \
  -H "Authorization: Bearer $2" \
  -H "Content-Type: application/json"
echo

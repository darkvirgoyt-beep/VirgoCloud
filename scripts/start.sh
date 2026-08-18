#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and configure secure production values." >&2
  exit 1
fi

docker compose up -d --build
echo "VirgoCloud web UI: http://localhost:3000"
echo "VirgoCloud API:    http://localhost:4000/health"

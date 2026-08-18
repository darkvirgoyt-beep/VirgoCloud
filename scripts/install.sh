#!/usr/bin/env sh
set -eu

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine and the Compose plugin first." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi

cp -n .env.example .env || true
pnpm install
echo "Dependencies installed. Edit .env with production secrets, then run pnpm db:migrate and ./scripts/start.sh."

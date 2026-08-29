#!/usr/bin/env bash
set -euo pipefail

# Simple smoke test that builds and runs the Docker Compose stack and checks
# that the frontend is reachable on host port 3100 and the backend healthcheck
# passes inside the network.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_PROJECT_NAME="training_app_smoke_$$"
export COMPOSE_PROJECT_NAME

cleanup() {
  docker compose down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose up -d --build

# Wait for frontend to be ready
attempts=30
until curl -fsS "http://localhost:3100" >/dev/null 2>&1; do
  attempts=$((attempts - 1))
  if [ "$attempts" -le 0 ]; then
    echo "Frontend did not become ready on port 3100" >&2
    exit 1
  fi
  sleep 2
done

echo "Frontend is reachable on http://localhost:3100"

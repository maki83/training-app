#!/usr/bin/env sh
set -eu

# Simple smoke test for the production Docker image.
# Builds the image, runs a container, waits for /health to return 200,
# then cleans up. Intended for optional CI use.

IMAGE_NAME="training-app:smoke-test"
CONTAINER_NAME="training-app-smoke-$$"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

# Build image
docker build -t "$IMAGE_NAME" -f Dockerfile .

# Run container
docker run -d --name "$CONTAINER_NAME" -p 3000:3000 -e NODE_ENV=production -e PORT=3000 "$IMAGE_NAME" >/dev/null

# Wait for health endpoint
MAX_RETRIES=30
SLEEP_SECONDS=1

i=0
while [ "$i" -lt "$MAX_RETRIES" ]; do
  if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then
    echo "Container healthcheck passed"
    exit 0
  fi
  i=$((i + 1))
  sleep "$SLEEP_SECONDS"
done

echo "Container healthcheck failed after $MAX_RETRIES attempts" >&2
exit 1

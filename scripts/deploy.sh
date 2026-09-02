#!/usr/bin/env bash
# Deploy script - runs on EC2 after git pull.
# Pulls API image from GHCR (built in CI). Requires GHCR_PAT env var for private images.
# Usage: ./scripts/deploy.sh

set -e
cd "$(dirname "$0")/.."

# Free disk space before pull (old images, build cache). Running containers' images are kept.
echo "Cleaning up disk before pull..."
docker image prune -a -f
docker builder prune -f

# If disk still critical (>85%), stop api to free its image, then pull and restart (brief downtime)
ROOT_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$ROOT_USAGE" -gt 85 ]; then
  echo "Disk usage ${ROOT_USAGE}% - stopping api to free image for pull (brief downtime)..."
  docker compose -f docker-compose.prod.yml stop api 2>/dev/null || true
  docker image prune -a -f
fi

# Log in to GHCR if PAT is set (needed for private images)
if [ -n "${GHCR_PAT:-}" ]; then
  echo "Logging in to GHCR..."
  echo "$GHCR_PAT" | docker login ghcr.io -u "${GHCR_USER}" --password-stdin
fi

echo "Pulling images (retries on flaky network)..."
PULLED=false
for i in 1 2 3; do
  if docker compose -f docker-compose.prod.yml pull; then PULLED=true; break; fi
  echo "Pull attempt $i failed, retrying in 30s..."
  sleep 30
done
if [ "$PULLED" != "true" ]; then
  echo "ERROR: Failed to pull images after 3 attempts"
  exit 1
fi

echo "Starting containers..."
docker compose -f docker-compose.prod.yml up -d

echo "Waiting for API health..."
HEALTHY=false
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -sf http://127.0.0.1/api/health >/dev/null; then
    HEALTHY=true
    break
  fi
  echo "  attempt $i/12..."
  sleep 5
done
if [ "$HEALTHY" != "true" ]; then
  echo "ERROR: API did not become healthy"
  docker compose -f docker-compose.prod.yml ps -a
  docker compose -f docker-compose.prod.yml logs --tail=80 api
  exit 1
fi

echo "Deploy complete."

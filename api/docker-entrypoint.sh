#!/bin/sh
set -e

echo "→ Running database migrations..."
npx prisma migrate deploy

echo "→ Starting API..."
exec node dist/api/main.js

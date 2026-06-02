#!/bin/sh
set -e

echo "→ Running database migrations..."
npx prisma migrate deploy

echo "→ Running database seed (idempotent)..."
npx prisma db seed

echo "→ Starting API..."
exec node dist/api/main.js

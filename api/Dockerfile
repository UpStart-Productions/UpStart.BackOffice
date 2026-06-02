# Stage 1: build
FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace files
COPY package.json package-lock.json ./
COPY api/ ./api/
COPY apps/ ./apps/
COPY nx.json tsconfig.base.json ./
COPY prisma.config.ts ./

# Install deps and build (DATABASE_URL needed for prisma config, not used by generate)
ENV DATABASE_URL=postgresql://ubo:ubo@localhost:5432/ubo?schema=public
RUN npm ci
RUN npx prisma generate
RUN npx nx run api:build

# generatePackageJson:true writes dist/api/package.json with only used deps.
# Regenerate a pruned lockfile from it.
RUN cd dist/api && npm install --package-lock-only

# Stage 2: run
FROM node:22-alpine AS runner
WORKDIR /app

# Copy built app
COPY --from=builder /app/dist/api ./dist/api
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/prisma.config.ts ./

# Use generated package.json (API-only deps) and pruned lockfile
COPY --from=builder /app/dist/api/package.json ./package.json
COPY --from=builder /app/dist/api/package-lock.json ./package-lock.json

# Install runtime deps + prisma CLI (migrations) + tsx (seed) + SES client (pruner may miss it)
RUN npm ci --omit=dev && npm install prisma tsx @aws-sdk/client-ses --no-save

# Copy generated Prisma client from builder (avoids needing DATABASE_URL in runner)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

ENV NODE_ENV=production

COPY api/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]

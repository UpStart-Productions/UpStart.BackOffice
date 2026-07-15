# Production deployment

This guide is for running Back Office in production on your own infrastructure. Adapt hostnames, registry URLs, and AWS resources to your environment.

## Architecture

| Component | Typical hosting |
|-----------|-----------------|
| **Admin SPA** | Static host (e.g. AWS Amplify, Netlify, S3 + CloudFront) |
| **API + PostgreSQL** | Docker Compose on a VM (e.g. EC2), or any container host |
| **Staff auth** | AWS Cognito user pool |
| **Email** | Amazon SES |
| **Files** | S3 (or local disk for small/private installs) |

The repo includes:

- `amplify.yml` — build spec if you use AWS Amplify for the admin app
- `docker-compose.prod.yml` — API + Postgres containers for a VM
- `api/Dockerfile` — API image (Chromium included for invoice PDFs)
- `scripts/deploy.sh` — pull image and restart containers on the server
- `.env.production.example` — production environment template

## 1. Database and API (Docker)

1. Provision a server with Docker and Docker Compose.
2. Clone this repo on the server.
3. Copy `.env.production.example` to `.env` and fill in values (never commit `.env`).
4. Update `docker-compose.prod.yml` to point at **your** container registry image (replace the default `image:` line).
5. Build and push the API image from your CI or locally, then on the server:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The API container runs migrations on startup (`api/docker-entrypoint.sh`). Seed is not run automatically in production — use `npm run dev:seed` manually on the server if you add seed data later.

Point your API domain (e.g. `https://api.example.com`) at the server. Set `API_BASE_URL` in `.env` to match.

## 2. Admin SPA

Build the admin app with production Cognito settings:

```bash
# Set env vars (see amplify.yml header comments), then:
node scripts/set-amplify-env.js
npx nx build admin --configuration=amplify
```

Deploy `dist/admin/browser` to your static host. Required build-time variables include `API_BASE_URL`, `COGNITO_*`, and Cognito redirect URLs for your admin domain (e.g. `https://office.example.com`).

If using **AWS Amplify**, connect the repo and set the variables listed in `amplify.yml`. Amplify runs the build automatically.

## 3. AWS services

Configure in **us-west-2** (or update region consistently in code and env):

| Service | Purpose |
|---------|---------|
| **Cognito** | Staff login; app client callbacks must match your admin URL |
| **SES** | Invoice email — see [ses-setup.md](ses-setup.md) |
| **S3** | File storage — see [storage-and-s3.md](storage-and-s3.md) |

Upload branded templates from `email-templates/` in the Cognito console (invitation, forgot password).

## 4. CORS and integrations

Set `CORS_ORIGINS` in production `.env` to your admin origin and any public sites that call the API (booking widget, client portal, mobile app origins if applicable).

Optional integrations configured in admin **Settings**:

- **Asana** — OAuth redirect: `{API_BASE_URL}/asana/callback`
- **Google Calendar** — OAuth redirect: `{API_BASE_URL}/google-calendar/callback`
- **Client portal** — set `PORTAL_BASE_URL`, `PORTAL_SESSION_SECRET`, and optionally `PORTAL_COOKIE_DOMAIN`
- **Lead ingest** — create service API keys in Settings; callers send `x-api-key`

## 5. CI/CD (optional)

You can automate API image builds and server deploys with GitHub Actions (or similar). The workflow must:

1. Build and push the API Docker image to your registry.
2. SSH to the server (or use a runner there), `git pull`, and run `scripts/deploy.sh`.

Store registry credentials and SSH keys as CI secrets — never in the repo.

## Checklist

- [ ] PostgreSQL reachable from API container
- [ ] `.env` on server with `NODE_ENV=production`
- [ ] Cognito pool + app client with correct callback URLs
- [ ] SES domain verified; `MAIL_FROM_EMAIL` set
- [ ] S3 bucket + IAM permissions (if using S3)
- [ ] Admin build points at production `API_BASE_URL`
- [ ] `CORS_ORIGINS` includes all browser origins that call the API

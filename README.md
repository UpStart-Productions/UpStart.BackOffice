# UpStart Back Office

A self-hosted back office for agencies and small teams: CRM, project management, time tracking, invoicing, accounting, bookings, and a client portal API. The admin app is an Angular SPA; the API is NestJS with PostgreSQL.

---

## What's included

### Admin app

| Module | Description |
|--------|-------------|
| **Dashboard** | Configurable widgets: time today, pipeline, invoices, projects |
| **Clients** | Client records, contact info, portal access, files and notes |
| **Projects** | Projects per client, tasks, Asana sync, artifacts |
| **Time tracking** | Start/stop timer, manual entries, hourly rates |
| **Invoices** | Draft → send → paid workflow, PDF generation, email delivery |
| **Pipeline** | Kanban CRM board; leads by stage; convert to client |
| **Bookings** | View/cancel appointments; configure booking types |
| **Network** | Partner/vendor directory (companies and contacts) |
| **Reports** | Time and invoice reports with PDF/Excel export |
| **Accounting** | Chart of accounts, journal entries, bank CSV import, financial reports |
| **Users** | Staff user management, Cognito invites, avatars |
| **Settings** | Asana OAuth, Google Calendar OAuth, service API keys |

Shared UI: global search, file/link/note artifacts on clients, projects, leads, and network contacts, confirm-before-delete dialogs.

### API

REST API under `/api`. Staff routes use Cognito JWT in production (or simple email auth locally). Public routes support booking widgets, client portal sessions, and lead ingest via API keys.

The client portal UI is not in this repo — you host it separately or integrate with your own site.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Monorepo | Nx |
| Admin | Angular, PrimeNG |
| API | NestJS, Prisma, PostgreSQL 16 |
| Auth (production) | AWS Cognito + JWT |
| Auth (local dev) | Email-only via request header |
| Email | Amazon SES (optional) |
| Files | Local disk or S3 (optional) |
| Node | **22.12.0** (see `package.json` engines) |

---

## Quick start

### Prerequisites

- **Node.js 22.12.0** (`nvm use` or match `engines` in `package.json`)
- **Docker** (for PostgreSQL)
- **npm**

### Run locally

```bash
git clone <repo-url> UpStart.BackOffice
cd UpStart.BackOffice
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

Open **http://localhost:4201**.

`npm run dev` starts PostgreSQL migrations, seeds sample data if the database is empty, then runs the API and admin app together.

### First login (development)

With Cognito unset in `.env`, the login page accepts any email that exists in the database. The seed creates:

| Email | Role |
|-------|------|
| `admin@upstart.test` | ADMIN |
| `member@upstart.test` | MEMBER |

Sample data also includes a client, project, booking type, and chart of accounts so you can explore the app immediately.

### Optional features

Configure in `.env` when you need them:

| Feature | What to set |
|---------|-------------|
| Staff login (production-style) | `COGNITO_*` variables |
| Invoice email | `AWS_*`, `MAIL_FROM_*` |
| Cloud file storage | `STORAGE_PROVIDER=s3`, `S3_BUCKET` |
| Client portal links | `PORTAL_BASE_URL`, `PORTAL_SESSION_SECRET` |

Without AWS credentials, invoice send shows "Email not configured" and files stay on local disk under `uploads/`.

See `.env.example` for all variables.

### Going to production

See **[docs/deployment.md](docs/deployment.md)** for hosting the admin SPA, API, Cognito, and optional AWS services. Also:

- [docs/ses-setup.md](docs/ses-setup.md) — invoice email via SES
- [docs/storage-and-s3.md](docs/storage-and-s3.md) — S3 file storage
- `.env.production.example` — server environment template

---

## Repository layout

```
├── admin/           # Angular admin SPA
├── api/             # NestJS API
├── apps/api/prisma/ # Schema, migrations, seed
├── libs/shared/     # Shared types and helpers
├── scripts/         # Dev env generation, port cleanup
├── tools/           # CLI utilities (seed, invites, SES test)
├── docs/            # Production deployment guides (SES, S3, hosting)
├── email-templates/ # Cognito HTML email templates
└── docker-compose.yml  # Local PostgreSQL
```

---

## npm scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Full local stack (migrate, seed-if-needed, API + admin) |
| `npm run dev:api` | API only |
| `npm run dev:admin` | Admin only |
| `npm run dev:seed` | Run seed |
| `npm run dev:reset` | Migrate + generate + seed |
| `npm run add-admin-user` | Add a staff user to the database |

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Admin can't reach API | API running; proxy in `admin/proxy.conf.json` |
| Login fails (dev) | User exists in DB; run `npm run dev:seed` |
| Migrations fail | Postgres up (`docker compose up -d`); `DATABASE_URL` in `.env` |
| Email not sending | AWS/SES vars in `.env`; `npm run test-ses -- you@example.com` |

---

## License

MIT — see `package.json`.

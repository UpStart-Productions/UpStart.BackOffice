# Storage and S3 layout

**AWS region:** This project always uses **`us-west-2`** for S3, Cognito, SES, and other AWS services.

Uploads use a configurable backend: **local disk** (`STORAGE_PROVIDER=local`, default) or **S3** (`STORAGE_PROVIDER=s3`). Keys are object paths in the bucket; folders appear when the first file is written (no pre-create on client/project save).

## Key layout

| Prefix | Path | Description |
|--------|------|-------------|
| `avatars/` | `{userId}/` | User avatars and other account assets |
| `clients/` | `{clientId}/` | Client logo and client-level files |
| `clients/` | `{clientId}/projects/{projectId}/` | Project-specific files |
| `clients/` | `{clientId}/invoices/{invoiceId}.pdf` | Invoice PDFs (per-client; preferred over a global `invoices/` tree) |

## Local vs S3

- **Local:** Files under `uploads/`; served at `/api/uploads/{key}`. DB stores relative URLs (e.g. `/api/uploads/avatars/...`).
- **S3:** DB stores full public URLs. Set `S3_PUBLIC_URL` for CloudFront or a custom domain. Ensure the bucket allows read access from the admin origin (bucket policy or CDN).

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `STORAGE_PROVIDER` | No | `local` (default) or `s3` |
| `S3_BUCKET` | When `s3` | e.g. `upstart-back-office-files` |
| `S3_REGION` | No | Optional; defaults to `AWS_REGION` (`us-west-2`) |
| `S3_PUBLIC_URL` | No | Override public base URL |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | When `s3` | Same keys as Cognito/SES; IAM needs `s3:PutObject`, `GetObject`, `DeleteObject` on the bucket |

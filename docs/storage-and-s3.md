# Storage and S3 layout

**AWS region:** This project uses **`us-west-2`** for S3, Cognito, SES, and other AWS services.

Uploads use a configurable backend: **local disk** (`STORAGE_PROVIDER=local`, default) or **S3** (`STORAGE_PROVIDER=s3`). Keys are object paths in the bucket.

## Key layout

| Prefix | Path | Description |
|--------|------|-------------|
| `avatars/` | `{userId}/` | User avatars |
| `clients/` | `{clientId}/` | Client root (`.keep` on create) |
| `clients/` | `{clientId}/invoices/` | Invoice PDFs + `.keep` on client create |
| `clients/` | `{clientId}/invoices/{displayNumber}.pdf` | Invoice PDF (saved on download, send, or update) |
| `clients/` | `{clientId}/projects/{projectId}/` | Project files + `.keep` on project create |

Placeholder files use the name **`.keep`** (zero bytes) so empty prefixes appear as folders in the S3 console.

## Lifecycle

| Event | Storage action |
|--------|----------------|
| Client created | `clients/{id}/.keep`, `clients/{id}/invoices/.keep` |
| Project created | `clients/{clientId}/projects/{projectId}/.keep` |
| Client deleted | Remove entire `clients/{id}/` prefix |
| Project deleted | Remove `clients/{clientId}/projects/{projectId}/` prefix |
| Invoice PDF generated | `clients/{clientId}/invoices/{displayNumber}.pdf` |
| Invoice deleted | Remove that PDF key |

Backfill existing rows: `npx tsx tools/backfill-storage-folders.ts`

## Local vs S3

- **Local:** Files under `uploads/`; served at `/api/uploads/{key}`.
- **S3:** Objects stay private in the bucket. The API stores proxy paths like `/api/uploads/{key}` and serves files via `GET /api/uploads/*` using IAM credentials.

## Environment

| Variable | Required | Notes |
|----------|----------|--------|
| `STORAGE_PROVIDER` | No | `local` (default) or `s3` |
| `S3_BUCKET` | When `s3` | Your bucket name |
| `S3_REGION` | No | Defaults to `AWS_REGION` (`us-west-2`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | When `s3` | Same keys as Cognito/SES; needs `s3:PutObject`, `GetObject`, `DeleteObject`, `ListBucket` (for prefix delete) |

## IAM policy (S3)

Minimal permissions for the API's storage service:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

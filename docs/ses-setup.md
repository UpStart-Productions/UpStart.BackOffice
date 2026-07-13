# SES setup (invoice email)

Invoice **Send to client** uses Amazon SES. This project uses AWS region **`us-west-2`**. Your sender address must use a domain verified in SES.

## Step 1 — IAM credentials

Create an IAM user (or use an existing programmatic user) with SES send access in **us-west-2**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    }
  ]
}
```

Create an **access key** for that user. Paste the key id and secret into `.env` (never commit them).

## Step 2 — Credentials (`.env` or AWS CLI profile)

The API uses the same credential sources as S3: **explicit env vars** or the **default AWS chain** (`~/.aws/credentials`, `AWS_PROFILE`, etc.).

In the repo root `.env`:

```env
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
MAIL_FROM_EMAIL=hello@example.com
MAIL_FROM_NAME=Back Office
```

Or omit keys from `.env` and use `aws configure` / `AWS_PROFILE`.

- **Sender** must use your verified domain (e.g. `hello@example.com`).

## Step 3 — Restart the API

Stop and restart `npm run dev` (or restart only the API process) so it picks up `.env` changes.

On startup you should see a log line like: `SES ready (region=us-west-2, from=hello@example.com)`.

## Step 4 — Test SES without the UI

```bash
npm run test-ses -- your-inbox@example.com
```

If this succeeds, SES and `.env` are correct. If it fails, read the AWS error (unverified identity, wrong region, invalid credentials).

## Step 5 — Send an invoice from the admin app

1. Client record must have a valid **email** address.
2. Open **Invoices** → draft invoice → row menu → **Send to client**.

The email includes the invoice **PDF as an attachment** (same file saved under `clients/{clientId}/invoices/`).

## Production

Use the same variables on your server (see `.env.production.example`). The IAM user or instance role needs the same SES permissions. Sender must remain an address on your verified domain.

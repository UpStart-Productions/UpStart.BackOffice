# SES setup (invoice email)

Invoice **Send to client** uses Amazon SES in **us-west-2**. The verified domain **heyupstart.com** must match the sender address in `.env`.

## Step 1 — IAM credentials (local API)

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

Create an **access key** for that user. You will paste the key id and secret into `.env` (never commit them).

## Step 2 — Credentials (`.env` or AWS CLI profile)

The API uses the same credential sources as S3: **explicit env vars** or the **default AWS chain** (`~/.aws/credentials`, `AWS_PROFILE`, etc.).

In the repo root `.env` (any one naming style works):

```env
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
# aliases also supported: ACCESS_KEY / SECRET_ACCESS_KEY
MAIL_FROM_EMAIL=hello@heyupstart.com
MAIL_FROM_NAME=UpStart Back Office
```

Or omit keys from `.env` and use `aws configure` / `AWS_PROFILE` — invoice email will use that profile.

- **Sender** must use the verified domain (e.g. `hello@heyupstart.com`). Region must be **us-west-2**.

## Step 3 — Restart the API

Stop and restart `npm run dev` (or restart only the API process) so it picks up `.env` changes.

On startup you should see a log line like: `SES ready (region=us-west-2, from=hello@heyupstart.com)`.

## Step 4 — Test SES without the UI

```bash
npm run test-ses -- your-inbox@example.com
```

If this succeeds, SES and `.env` are correct. If it fails, read the AWS error (unverified identity, wrong region, invalid credentials).

## Step 5 — Send an invoice from the admin app

1. Client record must have a valid **email** address.
2. Open **Invoices** → draft invoice → row menu → **Send to client**.

The email is HTML notification text today; **PDF is not attached** yet (use **Download PDF** separately).

## Production (EC2)

Same variables as in `.env.production.example`. The IAM user or instance role needs the same SES permissions. Sender must remain a **heyupstart.com** address verified in **us-west-2**.

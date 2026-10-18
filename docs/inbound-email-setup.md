# Inbound email capture: AWS setup

How client email gets into UBO. Staff set up a Gmail filter that forwards client mail to their workspace's capture address (for example `upstart@in.heyupstart.com`). The pieces below turn that address into timeline entries.

```
Gmail filter -> upstart@<INBOUND_DOMAIN>
   -> SES receipt rule (MX record points the domain at SES)
        1. S3 action:     raw message saved to s3://<bucket>/inbound/<messageId>
        2. Lambda action: ubo-inbound-email
   -> POST https://api.heyupstart.com/api/communications/ingest-email   (x-api-key)
   -> API reads the .eml from S3, parses it, matches contacts, writes the Interaction
```

The alias (the part before the `@`) picks the tenant. Today there is one tenant, so there is one alias, created on first API start from the tenant slug.

## One-time setup

You need: the AWS CLI signed in to the account you want (us-west-2), a domain or subdomain you control, and a UBO service key (Settings, service keys).

```bash
INBOUND_DOMAIN=in.heyupstart.com UBO_SERVICE_KEY=<key> \
  npm run setup-inbound-email-aws
```

Add `DRY_RUN=1` first to see every change without making it. The script is safe to re-run. It creates:

| Resource | Name |
|----------|------|
| S3 bucket (private, encrypted, raw mail expires after `RETENTION_DAYS`, default 365) | `ubo-inbound-email-<account id>` |
| Lambda (Node 22, no dependencies) | `ubo-inbound-email` |
| IAM role for the Lambda | `ubo-inbound-email-role` |
| SES receipt rule | `ubo-inbound-email` |

If the account already has an **active SES rule set** (GrovLink, SPP), the script adds its rule to that set instead of replacing it. Otherwise it creates and activates a set named `ubo-inbound`. SES allows only one active rule set per region, so check this before running in a shared account.

Then do the three manual steps the script prints:

1. **DNS.** Add `MX 10 inbound-smtp.us-west-2.amazonaws.com` for the inbound domain. Use a dedicated subdomain. Never repoint the MX of a domain that already receives real mail.
2. **API environment** (the `.env` that `docker-compose.prod.yml` reads), then redeploy:
   ```
   INBOUND_EMAIL_DOMAIN=in.heyupstart.com
   INBOUND_EMAIL_BUCKET=ubo-inbound-email-<account id>
   INTERNAL_EMAIL_DOMAINS=<your team's domains, comma separated>
   ```
3. **Let the API read the bucket.** Give its AWS credentials `s3:GetObject` on `arn:aws:s3:::<bucket>/inbound/*`. Passing `API_IAM_USER=<user>` to the script does this for you.

## Check it works

1. `dig MX in.heyupstart.com` shows the SES endpoint.
2. Send an email from outside to `upstart@in.heyupstart.com`.
3. Within a minute it appears in UBO's Unfiled inbox. If it doesn't, see below.

## Troubleshooting

| Symptom | Look at |
|---------|---------|
| Nothing arrives | MX record (propagation can take a while); that the SES rule set is the *active* one (`aws ses describe-active-receipt-rule-set`) |
| Object appears in S3 but not in UBO | CloudWatch log group `/aws/lambda/ubo-inbound-email`. An HTTP 401 means the service key in the Lambda is wrong or revoked; a connection error means `INGEST_BACKEND_URL` is wrong |
| Lambda logs `ingested` with status `dropped_unknown_alias` | The address's local part isn't a known alias. Check Settings, Email capture |
| Status `dropped_internal_only` | Every address on the message is a team address. Add the client's address, or check `INTERNAL_EMAIL_DOMAINS` isn't too broad |
| API log: `INBOUND_EMAIL_BUCKET is not set` or an S3 access error | Step 2 or 3 above |

The Lambda retries failed calls twice, and ingest is idempotent (it dedupes on Message-ID), so retries and re-sends never duplicate a message.

**Replaying a message:** download it with `aws s3 cp s3://<bucket>/inbound/<messageId> msg.eml`, then `UBO_SERVICE_KEY=<key> npx tsx tools/ingest-eml.ts msg.eml --api https://api.heyupstart.com`. Use `--to` with the real capture address.

## Data handling notes

- Raw messages stay in S3 until the lifecycle rule expires them. The parsed text lives in the database indefinitely. Set `RETENTION_DAYS` to match whatever you decide about retention.
- Message bodies can contain sensitive personal information. The HIPAA decision (see the CRM spec) should be made before TPN's real mail flows through this.
- The Lambda logs only the SES message id and the outcome, never subjects, addresses or bodies.
- The service key is stored in the Lambda's environment. Rotate it by creating a new key in Settings and re-running the setup script with it.

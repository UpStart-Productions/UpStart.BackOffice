#!/usr/bin/env bash
# One-time (and re-runnable) AWS setup for UpStart Back Office inbound email capture:
#   SES receives mail for INBOUND_DOMAIN -> raw message saved to S3 -> Lambda -> Back Office API.
#
#   INBOUND_DOMAIN=in.heyupstart.com UBO_SERVICE_KEY=<key from Settings> \
#   (INBOUND_DOMAIN must match INBOUND_EMAIL_DOMAIN in api/src/app/communications/communications.constants.ts)
#     bash tools/setup-inbound-email-aws.sh
#
# Optional env:
#   DRY_RUN=1                 print every change instead of making it (reads still run)
#   AWS_REGION                default us-west-2 (SES inbound must be available there)
#   (bucket name and API URL are constants in tools/inbound-email-lambda/index.mjs)
#   RETENTION_DAYS            days to keep raw .eml files in S3; 0 = keep forever (default 365)
#   API_IAM_USER              IAM user the API runs as; if set, it gets read access to the bucket
#
# It never replaces an existing active SES rule set: if one is active (GrovLink, SPP...),
# our rule is added to it instead. See docs/inbound-email-setup.md for the full checklist.
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
DRY_RUN="${DRY_RUN:-}"
INBOUND_DOMAIN="${INBOUND_DOMAIN:?Set INBOUND_DOMAIN, e.g. in.heyupstart.com (a domain or subdomain whose MX you will point at SES)}"
RETENTION_DAYS="${RETENTION_DAYS:-365}"
PREFIX="inbound/"
FUNC_NAME="ubo-inbound-email"
ROLE_NAME="ubo-inbound-email-role"
DEFAULT_RULE_SET="ubo-inbound"
RULE_NAME="ubo-inbound-email"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$ROOT/tools/inbound-email-lambda/function.zip"

if [[ -z "$DRY_RUN" && -z "${UBO_SERVICE_KEY:-}" ]]; then
  echo "Set UBO_SERVICE_KEY (create one in UpStart Back Office Settings → API Keys)." >&2
  exit 1
fi
SERVICE_KEY="${UBO_SERVICE_KEY:-dry-run-key}"

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="$(sed -n "s/^export const INBOUND_BUCKET = '\(.*\)';$/\1/p" "$ROOT/tools/inbound-email-lambda/index.mjs")"
FUNC_ARN="arn:aws:lambda:$REGION:$ACCOUNT:function:$FUNC_NAME"

run() {
  if [[ -n "$DRY_RUN" ]]; then echo "  [dry-run] $*"; else "$@"; fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Account $ACCOUNT, region $REGION, inbound domain $INBOUND_DOMAIN${DRY_RUN:+  (DRY RUN)}"

# -- 1. S3 bucket for raw messages ---------------------------------------------
echo "== S3 bucket $BUCKET"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "Using existing bucket"
else
  if [[ "$REGION" == "us-east-1" ]]; then
    run aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    run aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION"
  fi
fi
run aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
run aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

if [[ "$RETENTION_DAYS" != "0" ]]; then
  cat >"$TMP/lifecycle.json" <<JSON
{"Rules":[{"ID":"expire-raw-mail","Status":"Enabled","Filter":{"Prefix":"$PREFIX"},"Expiration":{"Days":$RETENTION_DAYS}}]}
JSON
  run aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
    --lifecycle-configuration "file://$TMP/lifecycle.json"
fi

cat >"$TMP/bucket-policy.json" <<JSON
{"Version":"2012-10-17","Statement":[{
  "Sid":"AllowSESPuts","Effect":"Allow","Principal":{"Service":"ses.amazonaws.com"},
  "Action":"s3:PutObject","Resource":"arn:aws:s3:::$BUCKET/$PREFIX*",
  "Condition":{
    "StringEquals":{"AWS:SourceAccount":"$ACCOUNT"},
    "StringLike":{"AWS:SourceArn":"arn:aws:ses:$REGION:$ACCOUNT:receipt-rule-set/*:receipt-rule/*"}
  }}]}
JSON
run aws s3api put-bucket-policy --bucket "$BUCKET" --policy "file://$TMP/bucket-policy.json"

# -- 2. Lambda -----------------------------------------------------------------
echo "== Lambda $FUNC_NAME"
if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  run aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
  }' >/dev/null
  run aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  if [[ -z "$DRY_RUN" ]]; then
    echo "Waiting for IAM role to propagate..."
    sleep 10
  fi
else
  echo "Using existing role $ROLE_NAME"
fi
ROLE_ARN="arn:aws:iam::$ACCOUNT:role/$ROLE_NAME"

bash "$ROOT/tools/inbound-email-lambda/pack.sh"

SERVICE_KEY="$SERVICE_KEY" python3 - >"$TMP/lambda-env.json" <<'PY'
import json, os
print(json.dumps({"Variables": {"INGEST_API_KEY": os.environ["SERVICE_KEY"]}}))
PY
chmod 600 "$TMP/lambda-env.json"

if aws lambda get-function --region "$REGION" --function-name "$FUNC_NAME" >/dev/null 2>&1; then
  run aws lambda update-function-code --region "$REGION" --function-name "$FUNC_NAME" \
    --zip-file "fileb://$ZIP" >/dev/null
  run aws lambda wait function-updated --region "$REGION" --function-name "$FUNC_NAME"
  run aws lambda update-function-configuration --region "$REGION" --function-name "$FUNC_NAME" \
    --role "$ROLE_ARN" --runtime nodejs22.x --handler index.handler --timeout 30 --memory-size 256 \
    --environment "file://$TMP/lambda-env.json" >/dev/null
  echo "Updated function"
else
  run aws lambda create-function --region "$REGION" --function-name "$FUNC_NAME" \
    --runtime nodejs22.x --handler index.handler --timeout 30 --memory-size 256 \
    --role "$ROLE_ARN" --zip-file "fileb://$ZIP" \
    --environment "file://$TMP/lambda-env.json" >/dev/null
  echo "Created function"
fi
if [[ -z "$DRY_RUN" ]]; then
  aws lambda wait function-active-v2 --region "$REGION" --function-name "$FUNC_NAME"
fi
run aws lambda put-function-event-invoke-config --region "$REGION" --function-name "$FUNC_NAME" \
  --maximum-retry-attempts 2 --maximum-event-age-in-seconds 21600 >/dev/null

# -- 3. SES receipt rule -------------------------------------------------------
echo "== SES receipt rule"
ACTIVE_SET="$(aws ses describe-active-receipt-rule-set --region "$REGION" \
  --query 'Metadata.Name' --output text 2>/dev/null || true)"
if [[ "$ACTIVE_SET" == "None" ]]; then ACTIVE_SET=""; fi

CREATED_SET=""
if [[ -n "$ACTIVE_SET" ]]; then
  RULE_SET="$ACTIVE_SET"
  echo "Active rule set '$RULE_SET' already exists; adding our rule to it (not replacing it)."
else
  RULE_SET="$DEFAULT_RULE_SET"
  if ! aws ses describe-receipt-rule-set --region "$REGION" --rule-set-name "$RULE_SET" >/dev/null 2>&1; then
    run aws ses create-receipt-rule-set --region "$REGION" --rule-set-name "$RULE_SET"
  fi
  CREATED_SET=1
fi

# SES checks these permissions when the rule is created, so they come first.
if ! aws lambda get-policy --region "$REGION" --function-name "$FUNC_NAME" 2>/dev/null | grep -q "ses-invoke"; then
  run aws lambda add-permission --region "$REGION" --function-name "$FUNC_NAME" \
    --statement-id ses-invoke --action lambda:InvokeFunction --principal ses.amazonaws.com \
    --source-account "$ACCOUNT" \
    --source-arn "arn:aws:ses:$REGION:$ACCOUNT:receipt-rule-set/$RULE_SET:receipt-rule/$RULE_NAME" >/dev/null
fi

cat >"$TMP/rule.json" <<JSON
{"Name":"$RULE_NAME","Enabled":true,"TlsPolicy":"Optional","ScanEnabled":true,
 "Recipients":["$INBOUND_DOMAIN"],
 "Actions":[
  {"S3Action":{"BucketName":"$BUCKET","ObjectKeyPrefix":"$PREFIX"}},
  {"LambdaAction":{"FunctionArn":"$FUNC_ARN","InvocationType":"Event"}}
 ]}
JSON
if aws ses describe-receipt-rule --region "$REGION" --rule-set-name "$RULE_SET" --rule-name "$RULE_NAME" >/dev/null 2>&1; then
  run aws ses update-receipt-rule --region "$REGION" --rule-set-name "$RULE_SET" --rule "file://$TMP/rule.json"
  echo "Updated rule $RULE_NAME"
else
  run aws ses create-receipt-rule --region "$REGION" --rule-set-name "$RULE_SET" --rule "file://$TMP/rule.json"
  echo "Created rule $RULE_NAME"
fi
if [[ -n "$CREATED_SET" ]]; then
  run aws ses set-active-receipt-rule-set --region "$REGION" --rule-set-name "$RULE_SET"
fi

# -- 4. API read access to the bucket ------------------------------------------
cat >"$TMP/api-read-policy.json" <<JSON
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::$BUCKET/$PREFIX*"}]}
JSON
if [[ -n "${API_IAM_USER:-}" ]]; then
  run aws iam put-user-policy --user-name "$API_IAM_USER" --policy-name ubo-inbound-email-read \
    --policy-document "file://$TMP/api-read-policy.json"
  echo "Granted $API_IAM_USER read access to s3://$BUCKET/$PREFIX"
fi

echo
echo "Done. Remaining manual steps:"
echo
echo "1. DNS: add this MX record where $INBOUND_DOMAIN is managed:"
echo "     $INBOUND_DOMAIN   MX   10   inbound-smtp.$REGION.amazonaws.com"
echo "   Use a subdomain; never repoint the MX of a domain that already receives real mail."
echo
echo "2. In UpStart Back Office Settings → Email capture, list your team's email domains."
echo
if [[ -n "${API_IAM_USER:-}" ]]; then
  echo "3. API bucket access: already granted to IAM user $API_IAM_USER."
else
  echo "3. Give the API's AWS credentials this policy (or re-run with API_IAM_USER=<user>):"
  cat "$TMP/api-read-policy.json"
  echo
fi

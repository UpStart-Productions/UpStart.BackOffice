// SES receipt rule -> (S3 action stores the raw message) -> this Lambda -> Back Office API.
// No dependencies: Node 22 has fetch built in, so the deployment is just this file.
//
// The only environment variable is the secret:
//   INGEST_API_KEY   a UpStart Back Office service key (Settings → API Keys), sent as x-api-key
// Everything else is fixed infrastructure, so it lives here.

export const INGEST_URL = 'https://api.heyupstart.com/api/communications/ingest-email';
export const INBOUND_BUCKET = 'upstart-back-office-inbound-email';
export const S3_PREFIX = 'inbound/'; // must match the SES rule's S3 action "object key prefix"

/** Turn one SES record into the API request body, or null if it should be skipped. */
export function toIngestBody(record) {
  if (record?.eventSource !== 'aws:ses' || !record.ses) return null;
  const { mail, receipt } = record.ses;
  if (!mail?.messageId || !receipt?.recipients?.length) return null;
  // Infected mail is never ingested. Spam verdicts are only logged: a missed client email
  // costs more than a junk one, and everything here was CC'd on purpose.
  if (receipt.virusVerdict?.status === 'FAIL') return null;
  return {
    recipients: receipt.recipients,
    s3Bucket: INBOUND_BUCKET,
    s3Key: `${S3_PREFIX}${mail.messageId}`,
    receivedAt: mail.timestamp,
  };
}

export async function handler(event, _context, deps = {}) {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  const log = deps.log ?? console.log;

  const apiKey = env.INGEST_API_KEY;
  if (!apiKey) throw new Error('INGEST_API_KEY must be set');

  for (const record of event?.Records ?? []) {
    const body = toIngestBody(record);
    const id = record?.ses?.mail?.messageId ?? 'unknown';
    if (!body) {
      log(JSON.stringify({ msg: 'skipped', messageId: id, virus: record?.ses?.receipt?.virusVerdict?.status }));
      continue;
    }
    if (record.ses.receipt.spamVerdict?.status === 'FAIL') {
      log(JSON.stringify({ msg: 'spam-verdict-fail (ingesting anyway)', messageId: id }));
    }

    const res = await fetchImpl(INGEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      // Throwing makes Lambda retry. Ingest is idempotent (Message-ID dedupe), so retries are safe.
      throw new Error(`ingest failed for ${id}: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    let status = 'ok';
    try {
      status = JSON.parse(text).status ?? 'ok';
    } catch {
      /* non-JSON success body is fine */
    }
    // Only the id and outcome are logged, never subjects or addresses.
    log(JSON.stringify({ msg: 'ingested', messageId: id, status }));
  }
}

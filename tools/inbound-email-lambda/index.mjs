// SES receipt rule -> (S3 action stores the raw message) -> this Lambda -> UBO API.
// No dependencies: Node 22 has fetch built in, so the zip is just this file.
//
// Env:
//   INGEST_BACKEND_URL  API origin, no /api (e.g. https://api.heyupstart.com)
//   INGEST_API_KEY      a UBO service key (Settings), sent as x-api-key
//   INBOUND_BUCKET      bucket the SES S3 action writes to (passed to the API with each message)
//   S3_PREFIX           object key prefix used by the SES S3 action (default "inbound/")

const INGEST_PATH = '/api/communications/ingest-email';

/** Turn one SES record into the API request body, or null if it should be skipped. */
export function toIngestBody(record, bucket, prefix = 'inbound/') {
  if (record?.eventSource !== 'aws:ses' || !record.ses) return null;
  const { mail, receipt } = record.ses;
  if (!mail?.messageId || !receipt?.recipients?.length) return null;
  // Infected mail is never ingested. Spam verdicts are only logged: mail relayed by
  // Gmail forwarding can score oddly, and a missed client email costs more than a junk one.
  if (receipt.virusVerdict?.status === 'FAIL') return null;
  return {
    recipients: receipt.recipients,
    s3Bucket: bucket,
    s3Key: `${prefix}${mail.messageId}`,
    receivedAt: mail.timestamp,
  };
}

export async function handler(event, _context, deps = {}) {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetch ?? fetch;
  const log = deps.log ?? console.log;

  const base = (env.INGEST_BACKEND_URL ?? '').trim().replace(/\/+$/, '');
  const apiKey = env.INGEST_API_KEY;
  const bucket = env.INBOUND_BUCKET;
  if (!base || !apiKey || !bucket) throw new Error('INGEST_BACKEND_URL, INGEST_API_KEY and INBOUND_BUCKET must be set');
  const prefix = env.S3_PREFIX ?? 'inbound/';

  for (const record of event?.Records ?? []) {
    const body = toIngestBody(record, bucket, prefix);
    const id = record?.ses?.mail?.messageId ?? 'unknown';
    if (!body) {
      log(JSON.stringify({ msg: 'skipped', messageId: id, virus: record?.ses?.receipt?.virusVerdict?.status }));
      continue;
    }
    if (record.ses.receipt.spamVerdict?.status === 'FAIL') {
      log(JSON.stringify({ msg: 'spam-verdict-fail (ingesting anyway)', messageId: id }));
    }

    const res = await fetchImpl(`${base}${INGEST_PATH}`, {
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

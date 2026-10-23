// Run with: node --test tools/inbound-email-lambda/index.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handler, INBOUND_BUCKET, INGEST_URL, toIngestBody } from './index.mjs';

const record = (over = {}) => ({
  eventSource: 'aws:ses',
  ses: {
    mail: { messageId: 'abc123', timestamp: '2026-10-17T12:00:00.000Z' },
    receipt: {
      recipients: ['tpn@in.example.test'],
      virusVerdict: { status: 'PASS' },
      spamVerdict: { status: 'PASS' },
    },
    ...over,
  },
});
const env = { INGEST_API_KEY: 'secret-key' };
const ok = (json = { status: 'created' }) => ({ ok: true, status: 200, text: async () => JSON.stringify(json) });

test('points at the production API and the inbound bucket', () => {
  assert.equal(INGEST_URL, 'https://api.heyupstart.com/api/communications/ingest-email');
  assert.equal(INBOUND_BUCKET, 'upstart-back-office-inbound-email');
});

test('builds the request body from the SES record', () => {
  assert.deepEqual(toIngestBody(record()), {
    recipients: ['tpn@in.example.test'],
    s3Bucket: INBOUND_BUCKET,
    s3Key: 'inbound/abc123',
    receivedAt: '2026-10-17T12:00:00.000Z',
  });
});

test('skips infected mail, non-SES records and incomplete records', () => {
  const infected = record();
  infected.ses.receipt.virusVerdict.status = 'FAIL';
  assert.equal(toIngestBody(infected), null);
  assert.equal(toIngestBody({ eventSource: 'aws:s3' }), null);
  assert.equal(toIngestBody({ eventSource: 'aws:ses', ses: { mail: {}, receipt: {} } }), null);
});

test('posts to the ingest endpoint with the api key', async () => {
  const calls = [];
  await handler({ Records: [record()] }, {}, {
    env,
    log: () => {},
    fetch: async (url, init) => (calls.push({ url, init }), ok()),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, INGEST_URL);
  assert.equal(calls[0].init.headers['x-api-key'], 'secret-key');
  assert.equal(JSON.parse(calls[0].init.body).s3Key, 'inbound/abc123');
});

test('throws on an API error so Lambda retries', async () => {
  await assert.rejects(
    handler({ Records: [record()] }, {}, {
      env, log: () => {},
      fetch: async () => ({ ok: false, status: 500, text: async () => 'boom' }),
    }),
    /HTTP 500/,
  );
});

test('does not call the API for skipped records and never logs the key', async () => {
  const infected = record();
  infected.ses.receipt.virusVerdict.status = 'FAIL';
  const lines = [];
  let calls = 0;
  await handler({ Records: [infected, record()] }, {}, {
    env,
    log: (l) => lines.push(l),
    fetch: async () => (calls++, ok()),
  });
  assert.equal(calls, 1);
  assert.ok(lines.every((l) => !l.includes('secret-key')));
});

test('fails fast without the key', async () => {
  await assert.rejects(handler({ Records: [record()] }, {}, { env: {}, log: () => {} }), /INGEST_API_KEY/);
});

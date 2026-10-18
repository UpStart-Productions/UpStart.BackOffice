/**
 * Post saved .eml files to the API's email-ingest endpoint, as if SES had received them.
 * No AWS needed. Used to exercise the communications pipeline locally.
 *
 * Setup:
 *   1. Run the API (`npm run dev`).
 *   2. Create a service key in the admin app (Settings -> service keys) and export it:
 *        export UBO_SERVICE_KEY=ubo_...
 *
 * Usage:
 *   npx tsx tools/ingest-eml.ts <file.eml> [more.eml ...] [--to alias@domain] [--api http://localhost:3001]
 *
 * Examples:
 *   npx tsx tools/ingest-eml.ts api/src/app/communications/__fixtures__/client-reply-forwarded.eml
 *
 * --to defaults to "upstart@in.local.test" (the default tenant's alias). If the API sets
 * INBOUND_EMAIL_DOMAIN, pass a --to on that domain.
 *
 * NOTE: the fixtures use fake addresses (example-tpn.test). For the sender to count as "team",
 * a staff user with that email must exist (or add example-tpn.test as a team domain in Settings > Email capture).
 */
import { readFileSync } from 'node:fs';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const flagValues = new Set(['--to', '--api'].map(arg).filter(Boolean));
  const files = process.argv
    .slice(2)
    .filter((a, i, all) => !a.startsWith('--') && !flagValues.has(a) && !all[i - 1]?.startsWith('--'));
  if (files.length === 0) {
    console.error('Usage: npx tsx tools/ingest-eml.ts <file.eml> [more.eml ...] [--to alias@domain] [--api URL]');
    process.exit(1);
  }
  const key = process.env.UBO_SERVICE_KEY;
  if (!key) {
    console.error('Set UBO_SERVICE_KEY to a service key created in the admin app.');
    process.exit(1);
  }
  const api = (arg('--api') ?? process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  const to = arg('--to') ?? 'upstart@in.local.test';

  for (const file of files) {
    const res = await fetch(`${api}/api/communications/ingest-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ recipients: [to], rawBase64: readFileSync(file).toString('base64') }),
    });
    const body = await res.text();
    console.log(`${file}\n  -> ${res.status} ${body}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

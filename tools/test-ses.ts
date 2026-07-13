/**
 * Send a test email via SES using the same env vars as the API.
 *
 * Usage:  npm run test-ses -- recipient@example.com
 */
import path from 'path';
import fs from 'fs';

function loadEnv(): void {
  try {
    require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
  } catch {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
        }
      }
    }
  }
}
loadEnv();

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const to = process.argv[2]?.trim();
if (!to) {
  console.error('Usage: npm run test-ses -- recipient@example.com');
  process.exit(1);
}

const region = process.env.AWS_REGION?.trim() || 'us-west-2';
const fromEmail = process.env.MAIL_FROM_EMAIL?.trim() || 'hello@example.com';
const fromName = process.env.MAIL_FROM_NAME?.trim() || 'UpStart Back Office';

function explicitCreds(): { accessKeyId: string; secretAccessKey: string } | undefined {
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID?.trim() ||
    process.env.ACCESS_KEY_ID?.trim() ||
    process.env.ACCESS_KEY?.trim();
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY?.trim() ||
    process.env.SECRET_ACCESS_KEY?.trim() ||
    process.env.SECRET_KEY?.trim();
  if (accessKeyId && secretAccessKey) return { accessKeyId, secretAccessKey };
  return undefined;
}

const credentials = explicitCreds();
const ses = new SESClient({
  region,
  ...(credentials ? { credentials } : {}),
});

const source = `${fromName} <${fromEmail}>`;

async function main() {
  console.log(`Region:   ${region}`);
  console.log(`Creds:    ${credentials ? 'env keys' : 'default AWS chain (~/.aws/credentials or AWS_PROFILE)'}`);
  console.log(`From:     ${source}`);
  console.log(`To:       ${to}`);
  console.log('Sending…');

  await ses.send(
    new SendEmailCommand({
      Source: source,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: 'UpStart Back Office — SES test', Charset: 'UTF-8' },
        Body: {
          Html: {
            Data: '<p>If you received this, SES is configured correctly for invoice email.</p>',
            Charset: 'UTF-8',
          },
        },
      },
    }),
  );

  console.log('Sent successfully.');
}

main().catch((err) => {
  console.error('Send failed:', err);
  process.exit(1);
});

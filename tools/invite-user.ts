/**
 * Send a Cognito sign-in invite so a user can sign in with email + temporary password.
 *
 * Usage:  npm run invite-user -- your-email@example.com
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

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error('Usage: npm run invite-user -- <email>');
    process.exit(1);
  }

  const region = process.env.COGNITO_REGION;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;

  if (!region || !userPoolId) {
    console.error('Missing COGNITO_REGION or COGNITO_USER_POOL_ID in .env');
    process.exit(1);
  }

  const client = new CognitoIdentityProviderClient({ region });

  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'preferred_username', Value: email },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
      }),
    );
    console.log(`Invite sent to ${email}.`);
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      console.log(`${email} already exists in Cognito. Resending invite...`);
      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
          MessageAction: 'RESEND',
        }),
      );
      console.log(`New temporary password sent to ${email}.`);
    } else {
      console.error('Error:', err);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const APP_SECRET = 'ubo-help-agent-integration-key-v1';

function encryptionKey(): Buffer {
  return createHash('sha256').update(APP_SECRET).digest();
}

export function encryptSecret(plaintext: string): string {
  if (plaintext == null || plaintext === '') {
    throw new Error('Cannot encrypt empty secret');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSecret(payload: string): string {
  if (payload == null || payload === '') {
    throw new Error('Invalid encrypted payload');
  }
  const [ivB64, tagB64, dataB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted payload');
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

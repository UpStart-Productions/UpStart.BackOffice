import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { resolveExplicitAwsCredentials } from '../common/aws-credentials.util';

/** Fetches raw messages that SES wrote to S3 (INBOUND_EMAIL_BUCKET). */
@Injectable()
export class InboundRawEmailService {
  private client?: S3Client;

  async fetch(key: string): Promise<Buffer> {
    const bucket = process.env.INBOUND_EMAIL_BUCKET?.trim();
    if (!bucket) throw new Error('INBOUND_EMAIL_BUCKET is not set');
    const credentials = resolveExplicitAwsCredentials();
    this.client ??= new S3Client({
      region: process.env.AWS_REGION?.trim() || 'us-west-2',
      ...(credentials ? { credentials } : {}),
    });
    const out = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!out.Body) throw new Error(`Empty S3 object: ${key}`);
    return Buffer.from(await out.Body.transformToByteArray());
  }
}

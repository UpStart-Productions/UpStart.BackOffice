import { Injectable } from '@nestjs/common';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { StorageService } from './storage.interface';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    const region =
      process.env.S3_REGION?.trim() || process.env.AWS_REGION?.trim() || 'us-west-2';

    if (!bucket) {
      throw new Error('S3_BUCKET is required when STORAGE_PROVIDER=s3');
    }

    this.bucket = bucket;
    this.client = new S3Client({ region });

    const customUrl = process.env.S3_PUBLIC_URL;
    this.publicBaseUrl = customUrl
      ? customUrl.replace(/\/$/, '')
      : `https://${bucket}.s3.${region}.amazonaws.com`;
  }

  private urlForKey(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async upload({
    buffer,
    key,
    mimeType,
  }: {
    buffer: Buffer;
    key: string;
    mimeType?: string;
  }): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType ?? 'application/octet-stream',
      }),
    );
    return this.urlForKey(key);
  }

  async copy({
    sourceKey,
    destKey,
  }: {
    sourceKey: string;
    destKey: string;
  }): Promise<string> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destKey,
      }),
    );
    return this.urlForKey(destKey);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async read(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    const chunks: Uint8Array[] = [];
    if (response.Body) {
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
    }
    return Buffer.concat(chunks);
  }

  keyFromUrl(url: string): string {
    const prefix = this.publicBaseUrl.endsWith('/')
      ? this.publicBaseUrl
      : this.publicBaseUrl + '/';
    if (url.startsWith(prefix)) return url.slice(prefix.length);
    if (url.startsWith('/api/uploads/')) return url.replace(/^\/api\/uploads\//, '');
    return url;
  }
}

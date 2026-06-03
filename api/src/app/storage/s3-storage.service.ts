import { Injectable } from '@nestjs/common';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { publicUrlForKey } from './asset-url.util';
import { StorageService } from './storage.interface';

@Injectable()
export class S3StorageService implements StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor() {
    const bucket = process.env.S3_BUCKET;
    const region =
      process.env.S3_REGION?.trim() || process.env.AWS_REGION?.trim() || 'us-west-2';

    if (!bucket) {
      throw new Error('S3_BUCKET is required when STORAGE_PROVIDER=s3');
    }

    this.bucket = bucket;
    this.client = new S3Client({ region });
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
    return publicUrlForKey(key);
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
    return publicUrlForKey(destKey);
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

  async deletePrefix(prefix: string): Promise<void> {
    const normalized = prefix.replace(/\/$/, '') + '/';
    let continuationToken: string | undefined;

    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: normalized,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = (list.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => !!k);

      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
      }

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  keyFromUrl(url: string): string {
    if (url.startsWith('/api/uploads/')) return url.replace(/^\/api\/uploads\//, '');
    if (url.includes('.amazonaws.com/')) {
      try {
        return new URL(url).pathname.replace(/^\//, '');
      } catch {
        /* fall through */
      }
    }
    return url;
  }
}

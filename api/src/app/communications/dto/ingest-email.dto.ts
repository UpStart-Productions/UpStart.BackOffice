import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

/**
 * Body of POST /communications/ingest-email (called by the SES -> S3 -> Lambda hop, or by
 * tools/ingest-eml.ts in development). Provide rawBase64, or s3Bucket + s3Key.
 */
export class IngestEmailDto {
  /** SES envelope recipients, e.g. ["tpn@in.example.com"]. The local part picks the tenant. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  recipients!: string[];

  /** Whole RFC 822 message, base64. Fine for dev and small mail; the JSON body limit is 10 MB. */
  @IsOptional()
  @IsString()
  rawBase64?: string;

  /** Bucket SES wrote the raw message to (sent by the Lambda, which owns that infrastructure). */
  @IsOptional()
  @IsString()
  s3Bucket?: string;

  /** Object key of the raw message in s3Bucket (production path). */
  @IsOptional()
  @IsString()
  s3Key?: string;

  /** ISO timestamp the mail was received; used when the message has no Date header. */
  @IsOptional()
  @IsString()
  receivedAt?: string;
}

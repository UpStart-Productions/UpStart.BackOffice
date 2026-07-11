import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** CSV file contents, base64-encoded — same convention as avatar uploads (avoids multipart issues behind CloudFront/WAF). */
export class ImportBankTransactionsDto {
  @ApiProperty() @IsString() fileBase64!: string;
}

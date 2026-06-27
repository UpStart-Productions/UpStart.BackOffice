import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SendInvoiceDto {
  @ApiProperty({ example: 'billing@example.com' })
  @IsEmail()
  to!: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsString()
  @IsOptional()
  toName?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class MarkInvoiceSentDto {
  @ApiPropertyOptional({ example: '2026-07-08' })
  @IsOptional()
  @IsDateString()
  sentAt?: string;
}
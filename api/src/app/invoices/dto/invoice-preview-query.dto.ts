import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { InvoicePeriodType } from '../invoice-period.util';

export class InvoicePreviewQueryDto {
  @ApiProperty() @IsString() clientId!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string;
  @ApiProperty({ enum: ['month', 'quarter', 'custom'] })
  @IsIn(['month', 'quarter', 'custom'])
  periodType!: InvoicePeriodType;
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(12) @IsOptional() @Type(() => Number) month?: number;
  @ApiPropertyOptional() @IsInt() @Min(2000) @Max(2100) @IsOptional() @Type(() => Number) year?: number;
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(4) @IsOptional() @Type(() => Number) quarter?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() from?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() to?: string;
}

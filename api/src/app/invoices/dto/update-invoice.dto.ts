import { IsString, IsOptional, IsNumber, IsDateString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateInvoiceDto {
  @ApiPropertyOptional() @IsDateString() @IsOptional() issueDate?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) taxRate?: number;
  @ApiPropertyOptional({ enum: ['DRAFT', 'SENT', 'PAID', 'VOID'] })
  @IsEnum(['DRAFT', 'SENT', 'PAID', 'VOID']) @IsOptional() status?: 'DRAFT' | 'SENT' | 'PAID' | 'VOID';
}

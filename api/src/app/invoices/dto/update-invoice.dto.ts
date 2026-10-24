import { IsString, IsOptional, IsNumber, IsDateString, IsEnum, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CreateInvoiceLineItemDto } from './create-invoice.dto';

export class UpdateInvoiceDto {
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(200) billToName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(200) billToEmail?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(1000) billToAddress?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() issueDate?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) taxRate?: number;
  @ApiPropertyOptional({ enum: ['DRAFT', 'SENT', 'PAID', 'VOID'] })
  @IsEnum(['DRAFT', 'SENT', 'PAID', 'VOID']) @IsOptional() status?: 'DRAFT' | 'SENT' | 'PAID' | 'VOID';
  @ApiPropertyOptional({ type: [CreateInvoiceLineItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateInvoiceLineItemDto) @IsOptional()
  lineItems?: CreateInvoiceLineItemDto[];
}

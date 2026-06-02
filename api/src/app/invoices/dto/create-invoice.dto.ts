import {
  IsString, IsOptional, IsNumber, IsDateString, IsArray, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateInvoiceLineItemDto {
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string;
  @ApiProperty() @IsString() description!: string;
  @ApiProperty() @IsNumber() @Type(() => Number) quantity!: number;
  @ApiProperty() @IsNumber() @Type(() => Number) unitPrice!: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) sortOrder?: number;
}

export class CreateInvoiceDto {
  @ApiProperty() @IsString() clientId!: string;
  @ApiProperty() @IsDateString() issueDate!: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) taxRate?: number;
  @ApiProperty({ type: [CreateInvoiceLineItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateInvoiceLineItemDto)
  lineItems!: CreateInvoiceLineItemDto[];
}

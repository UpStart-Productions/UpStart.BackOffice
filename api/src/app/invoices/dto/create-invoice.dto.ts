import {
  IsString, IsOptional, IsNumber, IsDateString, IsArray, ValidateNested, IsIn, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateInvoiceLineItemDto {
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string;
  @ApiProperty() @IsString() description!: string;
  @ApiProperty() @IsNumber() @Type(() => Number) quantity!: number;
  @ApiProperty() @IsNumber() @Type(() => Number) unitPrice!: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) sortOrder?: number;
  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional()
  timeEntryIds?: string[];
  /** Expenses on this line: billable ones on a client invoice, reimbursable ones on an invoice billed to the tenant. */
  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional()
  expenseIds?: string[];
}

export class CreateInvoiceDto {
  /** CLIENT (default): the tenant bills a client. TENANT: the user bills the tenant. */
  @ApiPropertyOptional({ enum: ['CLIENT', 'TENANT'] }) @IsIn(['CLIENT', 'TENANT']) @IsOptional() billTo?: 'CLIENT' | 'TENANT';
  /** Required when billing a client. */
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
  /** Bill-to overrides; default from the client, or from the tenant when billing the tenant. */
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(200) billToName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(200) billToEmail?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(1000) billToAddress?: string;
  @ApiProperty() @IsDateString() issueDate!: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) taxRate?: number;
  @ApiProperty({ type: [CreateInvoiceLineItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateInvoiceLineItemDto)
  lineItems!: CreateInvoiceLineItemDto[];
}

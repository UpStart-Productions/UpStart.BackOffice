import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty() @IsString() description!: string;
  /** Ignored for mileage (computed from miles). */
  @ApiProperty() @IsNumber() @IsOptional() @Type(() => Number) amount!: number;
  @ApiPropertyOptional() @IsString() @IsOptional() category?: string;
  @ApiProperty() @IsDateString() incurredAt!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isReimbursable?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isBillable?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() paymentMethod?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  /** Mileage: miles driven. The amount is miles x the organization's mileage rate; send null to make it a regular expense. */
  @ApiPropertyOptional({ nullable: true }) @IsNumber() @IsOptional() @Min(0.01) @Type(() => Number) miles?: number | null;
}

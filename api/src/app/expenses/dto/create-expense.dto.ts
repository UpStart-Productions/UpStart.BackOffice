import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateExpenseDto {
  @ApiProperty() @IsString() description!: string;
  @ApiProperty() @IsNumber() @Type(() => Number) amount!: number;
  @ApiPropertyOptional() @IsString() @IsOptional() category?: string;
  @ApiProperty() @IsDateString() incurredAt!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isReimbursable?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isBillable?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() paymentMethod?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
}

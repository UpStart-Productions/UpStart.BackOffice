import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  /** Omit (or null) for personal / internal projects. */
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string | null;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) hourlyRate?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isBillable?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() color?: string | null;
}

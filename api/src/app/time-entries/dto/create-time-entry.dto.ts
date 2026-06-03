import { IsString, IsOptional, IsBoolean, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTimeEntryDto {
  @ApiProperty() @IsString() projectId!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() projectTaskId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiProperty() @IsDateString() startedAt!: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() stoppedAt?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isBillable?: boolean;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) hourlyRate?: number;
}

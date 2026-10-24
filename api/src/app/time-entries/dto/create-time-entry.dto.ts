import { IsString, IsOptional, IsBoolean, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTimeEntryDto {
  /** Optional: time can be logged without a project. Send null on update to clear it. */
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string | null;
  /** Optional client when there is no project (with a project, the project's client is used). */
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string | null;
  @ApiPropertyOptional() @IsString() @IsOptional() projectTaskId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() taskId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiProperty() @IsDateString() startedAt!: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() stoppedAt?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isBillable?: boolean;
  @ApiPropertyOptional() @IsNumber() @IsOptional() @Type(() => Number) hourlyRate?: number;
}

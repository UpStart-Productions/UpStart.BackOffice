import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCapturePointDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  /** The lane new cards go in (its pipeline comes with it). */
  @ApiProperty() @IsString() stageId!: string;
  /** A UBO form whose submissions go to the pipeline. Omit for an outside form or link. */
  @ApiPropertyOptional() @IsString() @IsOptional() formId?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateCapturePointDto {
  @ApiPropertyOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) @IsOptional() name?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() stageId?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

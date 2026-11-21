import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCapturePointDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) name!: string;
  /** The lane new cards go in (its pipeline comes with it). */
  @ApiProperty() @IsString() stageId!: string;
  /** A UBO form whose submissions go to the pipeline. Omit for an outside form or link. */
  @ApiPropertyOptional() @IsString() @IsOptional() formId?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
  /** Websites that may post from a browser (POST /api/capture/:id). Empty = any website. */
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @MaxLength(300, { each: true }) @IsOptional() allowedOrigins?: string[];
}

export class UpdateCapturePointDto {
  @ApiPropertyOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) @IsOptional() name?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() stageId?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @MaxLength(300, { each: true }) @IsOptional() allowedOrigins?: string[];
}

/** POST /api/capture/:id from a website form. Name or email is required; the rest is optional. */
export class PublicCaptureDto {
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(200) @IsOptional() name?: string;
  @ApiPropertyOptional() @Transform(trim) @IsEmail() @MaxLength(254) @IsOptional() email?: string;
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(50) @IsOptional() phone?: string;
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(200) @IsOptional() organization?: string;
  /** What they wrote. Logged on the card's Activity. */
  @ApiPropertyOptional() @IsString() @MaxLength(5000) @IsOptional() message?: string;
  /** Title for that Activity note, for example the topic they picked. Defaults to the capture point's name. */
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(200) @IsOptional() subject?: string;
  /** Honeypot: a hidden field people never fill in. Filled in means a bot. */
  @ApiPropertyOptional() @IsString() @MaxLength(500) @IsOptional() website?: string;
  /** Milliseconds the visitor spent on the form. Under 3 seconds means a bot. */
  @ApiPropertyOptional() @IsNumber() @IsOptional() t?: number;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateStripeConfigDto {
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @MaxLength(200) publishableKey?: string;
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @MaxLength(400) secretKey?: string;
  @ApiPropertyOptional() @Transform(trim) @IsOptional() @IsString() @MaxLength(400) webhookSecret?: string;
}
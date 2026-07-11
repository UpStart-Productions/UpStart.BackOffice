import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Code and type are fixed after creation — posting logic depends on stable account codes. */
export class UpdateAccountDto {
  @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

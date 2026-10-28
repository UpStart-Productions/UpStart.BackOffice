import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateActivitySettingsDto {
  /** Days an email waits for a reply before it is listed under Needs reply. */
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) @IsOptional() needsReplyDays?: number;
  /** Days without contact before an active client is listed under Gone quiet. */
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(7) @Max(365) @IsOptional() goneQuietDays?: number;
}

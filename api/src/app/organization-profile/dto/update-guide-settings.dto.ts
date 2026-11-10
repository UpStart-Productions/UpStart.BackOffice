import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateGuideSettingsDto {
  /** Let the Back Office guide look up this tenant's records (sends them to the AI provider). */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() readsRecords?: boolean;
  /** Let the guide propose changes; each one runs only after the person confirms it. Needs readsRecords. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() makesChanges?: boolean;
}

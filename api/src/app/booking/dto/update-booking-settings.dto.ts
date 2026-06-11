import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class AvailabilityRuleDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiPropertyOptional({ description: 'Minutes from midnight in host timezone' })
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  startMinute!: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  endMinute!: number;
}

export class UpdateBookingSettingsDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  hostUserId?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(15)
  @Max(120)
  @IsOptional()
  durationMin?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  @IsOptional()
  bufferMin?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  @IsOptional()
  minNoticeHours?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  @IsOptional()
  maxDaysAhead?: number;

  @ApiPropertyOptional({ example: 'America/Los_Angeles' })
  @IsString()
  @IsOptional()
  timezone?: string;

  /** Public booking page URL (cancel links in confirmation emails). */
  @ApiPropertyOptional({ example: 'https://heyupstart.com/book-discovery-chat' })
  @IsString()
  @IsOptional()
  publicPageUrl?: string;

  @ApiPropertyOptional({ type: [AvailabilityRuleDto] })
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  @IsOptional()
  availabilityRules?: AvailabilityRuleDto[];
}

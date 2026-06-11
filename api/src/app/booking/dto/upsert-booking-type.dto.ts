import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadSource, LeadStage } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AvailabilityRuleDto } from './availability-rule.dto';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class UpsertBookingTypeDto {
  @ApiProperty({ example: 'upstart-discovery' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(SLUG_PATTERN, { message: 'Slug must be lowercase letters, numbers, and hyphens' })
  slug!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(64)
  brand?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  hostUserId?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  @IsOptional()
  durationMin?: number;

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

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  publicPageUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  calendarEventTitle?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  createLead?: boolean;

  @ApiPropertyOptional({ enum: LeadStage })
  @IsEnum(LeadStage)
  @IsOptional()
  leadStage?: LeadStage;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsEnum(LeadSource)
  @IsOptional()
  leadSource?: LeadSource;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(120)
  pipelineNoteTitle?: string;

  @ApiPropertyOptional({ description: 'Price in cents (for billable types)' })
  @IsInt()
  @Min(0)
  @IsOptional()
  priceCents?: number | null;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isBillable?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  paymentRequired?: boolean;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [AvailabilityRuleDto] })
  @ValidateNested({ each: true })
  @Type(() => AvailabilityRuleDto)
  @IsOptional()
  availabilityRules?: AvailabilityRuleDto[];
}

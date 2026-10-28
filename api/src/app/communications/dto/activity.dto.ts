import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

const TYPES = ['EMAIL', 'CALL', 'MEETING', 'NOTE'] as const;
export const ACTIVITY_QUEUES = ['REPLY', 'NEXT_STEP', 'QUIET'] as const;
export type ActivityQueueKey = (typeof ACTIVITY_QUEUES)[number];

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

/** Filters for the activity feed. With clientId or contactId it is that record's timeline; with neither, every organization. */
export class ActivityFeedQueryDto {
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactId?: string;
  @ApiPropertyOptional({ description: "With clientId: also show its people's activity that is not filed to any organization. Default true." })
  @Transform(toBool) @IsBoolean() @IsOptional() includePeople?: boolean;
  @ApiPropertyOptional({ enum: TYPES }) @IsIn(TYPES as unknown as string[]) @IsOptional() type?: (typeof TYPES)[number];
  @ApiPropertyOptional() @IsString() @IsOptional() loggedByUserId?: string;
  @ApiPropertyOptional() @IsISO8601() @IsOptional() from?: string;
  @ApiPropertyOptional() @IsISO8601() @IsOptional() to?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(200) @IsOptional() q?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() limit?: string;
  @ApiPropertyOptional() @IsISO8601() @IsOptional() before?: string;
}

export class ActivityQueuesQueryDto {
  @ApiPropertyOptional({ description: 'Only rows that are mine (default true).' })
  @Transform(toBool) @IsBoolean() @IsOptional() mine?: boolean;
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contactId?: string;
}

export class SetNextStepDto {
  /** What happens next. Empty or null clears the next step. */
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) @IsOptional() text?: string | null;
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsISO8601() @IsOptional() date?: string | null;
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsString() @IsOptional() ownerId?: string | null;
}

export class SnoozeDto {
  @ApiProperty({ enum: ACTIVITY_QUEUES }) @IsIn(ACTIVITY_QUEUES as unknown as string[]) queue!: ActivityQueueKey;
  @ApiProperty() @IsString() @MaxLength(300) refKey!: string;
  /** Hide until this date. Null: dismiss for good (e.g. "No reply needed"). */
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsISO8601() @IsOptional() until?: string | null;
}

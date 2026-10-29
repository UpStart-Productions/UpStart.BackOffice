import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListNotificationsQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}

export class MarkReadDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() read?: boolean;
}

export class EmailPreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_assigned?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_unassigned?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_mention?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_comment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_completed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_due_date_changed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_attachment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_moved?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_subtask_added?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() project_added?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() project_removed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_form_submission?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activity_forwarded?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activity_mention?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() care_form_submission?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() care_shift_assigned?: boolean;
}

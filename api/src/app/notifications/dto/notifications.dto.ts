import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateNested } from 'class-validator';

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

export class NotificationChannelDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() inApp?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() email?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() push?: boolean;
}

/** @deprecated Use NotificationPreferencesDto; flat booleans update email only. */
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
  @ApiPropertyOptional() @IsOptional() @IsBoolean() form_submission?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() client_form_submitted?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() form_attached?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() care_form_submission?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() care_shift_assigned?: boolean;
}

export class NotificationPreferencesDto {
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_assigned?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_unassigned?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_mention?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_comment?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_completed?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_due_date_changed?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_attachment?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_moved?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_subtask_added?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) project_added?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) project_removed?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) task_form_submission?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) activity_forwarded?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) activity_mention?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) form_submission?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) client_form_submitted?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) form_attached?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) care_form_submission?: NotificationChannelDto;
  @ApiPropertyOptional() @IsOptional() @ValidateNested() @Type(() => NotificationChannelDto) care_shift_assigned?: NotificationChannelDto;
}

export class SetNotificationPreferencesBodyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  preferences?: NotificationPreferencesDto;
}

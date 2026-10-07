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
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_mention?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_comment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_completed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() project_added?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() task_form_submission?: boolean;
}

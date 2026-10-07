import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskCustomFieldType, ProjectMemberRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// ── Projects ────────────────────────────────────────────────────────────────

export class AddToTasksDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) color?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) icon?: string | null;
}

/** Tasks-only project settings. Name, client, billing and active status are edited on the Projects page. */
export class UpdateTmProjectDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) color?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) icon?: string | null;
}

export class AddMemberDto {
  @ApiProperty() @IsString() userId!: string;
  @ApiPropertyOptional({ enum: ProjectMemberRole }) @IsOptional() @IsEnum(ProjectMemberRole) role?: ProjectMemberRole;
}

export class InviteMemberDto {
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(254) email!: string;
  @ApiPropertyOptional({ enum: ProjectMemberRole }) @IsOptional() @IsEnum(ProjectMemberRole) role?: ProjectMemberRole;
}

export class UpdateMemberDto {
  @ApiProperty({ enum: ProjectMemberRole }) @IsEnum(ProjectMemberRole) role!: ProjectMemberRole;
}

// ── Sections ────────────────────────────────────────────────────────────────

export class CreateSectionDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name!: string;
  /** Insert after this section; omit to append at the end, null to insert first. */
  @ApiPropertyOptional() @IsOptional() @IsString() afterSectionId?: string | null;
}

export class UpdateSectionDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCollapsed?: boolean;
}

export class MoveSectionDto {
  /** Place after this section; null = first. */
  @ApiPropertyOptional() @IsOptional() @IsString() afterSectionId?: string | null;
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export class CreateTaskDto {
  @ApiProperty() @IsString() projectId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() parentTaskId?: string | null;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(500) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() assigneeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() dueOn?: string | null;
  /** Insert after this task; omit = bottom of the section, null = top. */
  @ApiPropertyOptional() @IsOptional() @IsString() afterTaskId?: string | null;
}

export class UpdateTaskDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() assigneeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() dueOn?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString() dueAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCompleted?: boolean;
  /** { freq, interval, weekdays?, mode } or null */
  @ApiPropertyOptional() @Allow() recurrence?: unknown;
}

export class MoveTaskDto {
  /** Target section (top-level tasks). Omit to keep current section. */
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string | null;
  /** Place after this sibling; null = top. */
  @ApiPropertyOptional() @IsOptional() @IsString() afterTaskId?: string | null;
  /** Move to another project (into `sectionId`, or the bottom of its first section). */
  @ApiPropertyOptional() @IsOptional() @IsString() projectId?: string;
  /** Which of the task's projects this move applies to (home project when omitted). */
  @ApiPropertyOptional() @IsOptional() @IsString() fromProjectId?: string;
}

export class AddTaskProjectDto {
  @ApiProperty() @IsString() projectId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string | null;
}

// ── Tags ────────────────────────────────────────────────────────────────────

export class CreateTagDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) color?: string | null;
}

export class UpdateTagDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) color?: string | null;
}

/** Tag a task with an existing tag (tagId) or by name (created if new). */
export class AddTaskTagDto {
  @ApiPropertyOptional() @IsOptional() @IsString() tagId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) color?: string | null;
}

export class TaskListQueryDto {
  @ApiPropertyOptional({ enum: ['incomplete', 'completed', 'all'] })
  @IsOptional()
  @IsIn(['incomplete', 'completed', 'all'])
  completed?: 'incomplete' | 'completed' | 'all';
}

export class TaskSearchQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() projectId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
}

export class SetFieldValueDto {
  /** string | number | boolean | ISO date | optionId | optionId[] | null to clear */
  @ApiPropertyOptional() @Allow() value?: unknown;
}

// ── Custom fields ───────────────────────────────────────────────────────────

export class FieldOptionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() label!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
}

export class CreateFieldDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @ApiProperty({ enum: TaskCustomFieldType }) @IsEnum(TaskCustomFieldType) type!: TaskCustomFieldType;
  @ApiPropertyOptional({ type: [FieldOptionDto] }) @IsOptional() @IsArray() @Allow() options?: FieldOptionDto[];
}

export class UpdateFieldDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @ApiPropertyOptional({ type: [FieldOptionDto] }) @IsOptional() @IsArray() @Allow() options?: FieldOptionDto[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() sortOrder?: number;
}

// ── Comments ────────────────────────────────────────────────────────────────

export class CreateCommentDto {
  @ApiProperty() @IsString() @MinLength(1) body!: string;
}

export class UpdateCommentDto {
  @ApiProperty() @IsString() @MinLength(1) body!: string;
}

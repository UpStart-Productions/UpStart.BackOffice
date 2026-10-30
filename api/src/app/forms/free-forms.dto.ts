import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { FormSubmissionStatus } from '@upstart/back-office/shared';

export class CreateFreeFormDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
}

export class UpdateFreeFormDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  /** FormSettings; normalized on save. */
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}

export class AcceptSubmissionDto {
  @IsIn(['new', 'existing']) mode!: 'new' | 'existing';
  /** new: the Prospect's name (defaults to the respondent's organization). */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  /** existing: the organization to attach the submission to. */
  @IsOptional() @IsString() clientId?: string;
}

export const SUBMISSION_STATUSES: FormSubmissionStatus[] = ['PENDING', 'ACTIVE', 'DISMISSED'];

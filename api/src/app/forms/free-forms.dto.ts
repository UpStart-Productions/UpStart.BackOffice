import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { FormSubmissionStatus } from '@upstart/back-office/shared';

export class CreateFreeFormDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
}

export class ImportFreeFormDto {
  /** A form file (FormDefinition); checked by parseFormDefinition. */
  @IsObject() definition!: Record<string, unknown>;
  /** Optional: a different name than the file's. */
  @IsOptional() @IsString() @MaxLength(200) name?: string;
}

export class UpdateFreeFormDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  /** FormSettings; normalized on save. */
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
  /** Client forms: roleId -> "read" | "edit" (who sees and fills in results on client pages). */
  @IsOptional() @IsObject() access?: Record<string, string>;
}

export class AcceptSubmissionDto {
  @IsIn(['new', 'existing']) mode!: 'new' | 'existing';
  /** new: a client (the sender as its person) or an organization (a Prospect with a pipeline card). */
  @IsOptional() @IsIn(['client', 'organization']) newKind?: 'client' | 'organization';
  /** new: its name. */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  /** existing: the client or organization to attach the response to. */
  @IsOptional() @IsString() clientId?: string;
}

export const SUBMISSION_STATUSES: FormSubmissionStatus[] = ['PENDING', 'ACTIVE', 'DISMISSED'];

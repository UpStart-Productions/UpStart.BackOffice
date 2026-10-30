import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCareFormDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  /** roleId -> "read" | "edit"; roles left out have no access. */
  @IsOptional() @IsObject() access?: Record<string, string>;
}

export class CreateRecordDto {
  @IsString() formId!: string;
  @IsString() clientId!: string;
}

export class SaveValuesDto {
  /** fieldId -> value (null or empty clears it). Fields left out keep their value. */
  @IsObject() values!: Record<string, unknown>;
}

export class AcceptIntakeDto {
  @IsIn(['new', 'existing']) mode!: 'new' | 'existing';
  /** new: the organization name (a Prospect, with a pipeline card and the submitter as its person). */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  /** existing: the organization to attach the intake to. */
  @IsOptional() @IsString() clientId?: string;
}

import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { FORM_FIELD_TYPES, type CareLinkVerify, type FormFieldType } from '@upstart/back-office/shared';

const VERIFY: CareLinkVerify[] = ['NONE', 'PASSCODE', 'EMAIL_CODE'];

class OptionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(120) label!: string;
}

export class UpdateCareFormDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  /** roleId -> "read" | "edit"; roles left out have no access. */
  @IsOptional() @IsObject() access?: Record<string, string>;
}

export class SectionDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

export class CreateFieldDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsIn(FORM_FIELD_TYPES) type!: FormFieldType;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
}

/** The type can't change once answers may exist. */
export class UpdateFieldDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
}

export class MoveDto {
  @IsIn(['up', 'down']) direction!: 'up' | 'down';
}

export class CreateLinkDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsIn(VERIFY) verify!: CareLinkVerify;
  /** PASSCODE: what people type to open the link (shared separately). */
  @IsOptional() @IsString() @MinLength(4) @MaxLength(64) passcode?: string;
  /** EMAIL_CODE on a client link: where the code is sent. */
  @IsOptional() @IsEmail() email?: string;
  /** Days until the link stops working; 0 or empty = never. */
  @IsOptional() @IsInt() @Min(0) @Max(3650) expiresInDays?: number | null;
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

// ── Public links ──────────────────────────────────────────────────────────────

export class PasscodeDto {
  @IsString() @MaxLength(64) passcode!: string;
}

export class SendCodeDto {
  /** New-intake links: the visitor's own email. Client links use the email on the link. */
  @IsOptional() @IsEmail() email?: string;
}

export class VerifyCodeDto {
  @IsString() challengeId!: string;
  @IsString() @MaxLength(12) code!: string;
}

class SubmitterDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(60) phone?: string;
}

export class PublicSubmitDto {
  @IsObject() values!: Record<string, unknown>;
  @IsOptional() @ValidateNested() @Type(() => SubmitterDto) submitter?: SubmitterDto;
  /** Honeypot: people never see it, bots fill it in. */
  @IsOptional() @IsString() website?: string;
}

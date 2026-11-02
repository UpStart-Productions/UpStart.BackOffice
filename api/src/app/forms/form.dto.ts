import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { FORM_FIELD_TYPES, FORM_SUBFIELD_TYPES, type FormFieldType, type FormLinkVerify, type FormSubfieldType } from '@upstart/back-office/shared';

const VERIFY: FormLinkVerify[] = ['NONE', 'PASSCODE', 'EMAIL_CODE'];

class OptionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(400) label!: string;
  /** Scored forms only. */
  @IsOptional() @IsNumber() points?: number | null;
}

class SubfieldDto {
  /** Kept when editing an existing sub-field (its answers stay). */
  @IsOptional() @IsString() id?: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsIn(FORM_SUBFIELD_TYPES) type!: FormSubfieldType;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
}

export class SectionDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  /** Optional intro under the section title (null or empty clears it). Left out: unchanged. */
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
}

export class CreateFieldDto {
  /** A question, or a text block's formatted text (CONTENT; checked further by the form engine). */
  @IsString() @MinLength(1) @MaxLength(20000) name!: string;
  @IsIn(FORM_FIELD_TYPES) type!: FormFieldType;
  @IsOptional() @IsBoolean() required?: boolean;
  /** Scored forms only: the score area. */
  @IsOptional() @IsString() @MaxLength(40) scoreGroupId?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  /** Repeating groups: the sub-fields. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SubfieldDto) subfields?: SubfieldDto[];
  /** File uploads: several files instead of one. */
  @IsOptional() @IsBoolean() multiple?: boolean;
}

/** The type can change only while nobody has answered the form (the form engine checks). */
export class UpdateFieldDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(20000) name?: string;
  @IsOptional() @IsIn(FORM_FIELD_TYPES) type?: FormFieldType;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MaxLength(40) scoreGroupId?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  /** Repeating groups: the sub-fields (ids kept for existing ones; their types can't change). */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SubfieldDto) subfields?: SubfieldDto[];
  /** File uploads: several files instead of one. */
  @IsOptional() @IsBoolean() multiple?: boolean;
}

export class MoveDto {
  @IsIn(['up', 'down']) direction!: 'up' | 'down';
}

/** A new order (drag and drop): every id of the list, in order. */
export class OrderDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

export class CreateLinkDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsIn(VERIFY) verify!: FormLinkVerify;
  /** PASSCODE: what people type to open the link (shared separately). */
  @IsOptional() @IsString() @MinLength(4) @MaxLength(64) passcode?: string;
  /** EMAIL_CODE on a client link: where the code is sent. */
  @IsOptional() @IsEmail() email?: string;
  /** Days until the link stops working; 0 or empty = never. */
  @IsOptional() @IsInt() @Min(0) @Max(3650) expiresInDays?: number | null;
  /** Websites that may show the form (embeds); empty = any website. */
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(300, { each: true }) allowedOrigins?: string[];
}

export class UpdateLinkDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(300, { each: true }) allowedOrigins?: string[];
}

// ── Public links ──────────────────────────────────────────────────────────────

export class PasscodeDto {
  @IsString() @MaxLength(64) passcode!: string;
}

export class SendCodeDto {
  /** New-response links: the visitor's own email. Client links use the email on the link. */
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
  @IsOptional() @IsString() @MaxLength(200) organization?: string;
}

/** Auto-save on a public link: answers changed since the last save (merged into what's saved). */
export class PublicDraftDto {
  /** New-response links: the draft's token from the first save (kept in the browser). */
  @IsOptional() @IsString() @MaxLength(200) draftToken?: string;
  @IsObject() values!: Record<string, unknown>;
  @IsOptional() @ValidateNested() @Type(() => SubmitterDto) submitter?: SubmitterDto;
}

export class PublicSubmitDto {
  /** New-response links: send this auto-saved draft (instead of starting a new response). */
  @IsOptional() @IsString() @MaxLength(200) draftToken?: string;
  @IsObject() values!: Record<string, unknown>;
  @IsOptional() @ValidateNested() @Type(() => SubmitterDto) submitter?: SubmitterDto;
  /** Honeypot: people never see it, bots fill it in. */
  @IsOptional() @IsString() website?: string;
}

/** A form file (FormDefinition) to add to a module's form; checked by parseFormDefinition. */
export class FormFileDto {
  @IsObject() definition!: Record<string, unknown>;
}

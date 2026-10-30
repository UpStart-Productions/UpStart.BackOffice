import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { FORM_FIELD_TYPES, type FormFieldType, type FormLinkVerify } from '@upstart/back-office/shared';

const VERIFY: FormLinkVerify[] = ['NONE', 'PASSCODE', 'EMAIL_CODE'];

class OptionDto {
  @IsOptional() @IsString() id?: string;
  @IsString() @MaxLength(400) label!: string;
  /** Scored forms only. */
  @IsOptional() @IsNumber() points?: number | null;
}

export class SectionDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  /** Optional intro under the section title (null or empty clears it). Left out: unchanged. */
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
}

export class CreateFieldDto {
  @IsString() @MinLength(1) @MaxLength(400) name!: string;
  @IsIn(FORM_FIELD_TYPES) type!: FormFieldType;
  @IsOptional() @IsBoolean() required?: boolean;
  /** Scored forms only: the score area. */
  @IsOptional() @IsString() @MaxLength(40) scoreGroupId?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
}

/** The type can't change once answers may exist. */
export class UpdateFieldDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(400) name?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MaxLength(40) scoreGroupId?: string | null;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
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

export class PublicSubmitDto {
  @IsObject() values!: Record<string, unknown>;
  @IsOptional() @ValidateNested() @Type(() => SubmitterDto) submitter?: SubmitterDto;
  /** Honeypot: people never see it, bots fill it in. */
  @IsOptional() @IsString() website?: string;
}

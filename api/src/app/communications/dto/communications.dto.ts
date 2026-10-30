import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsISO8601, IsOptional, IsString, MaxLength,
} from 'class-validator';

export const MANUAL_TYPES = ['CALL', 'MEETING', 'NOTE'] as const;
export type ManualType = (typeof MANUAL_TYPES)[number];

export class FileInteractionDto {
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() leadId?: string;
  @ApiPropertyOptional({ description: 'Link the outside contacts on this item to the client so future mail files itself. Default true.' })
  @IsBoolean() @IsOptional() learn?: boolean;
}

export class LogInteractionDto {
  @ApiProperty({ enum: MANUAL_TYPES }) @IsIn(MANUAL_TYPES as unknown as string[]) type!: ManualType;
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() leadId?: string;
  @ApiPropertyOptional({ description: 'Log on a person: filed to their organization when they have exactly one.' })
  @IsString() @IsOptional() contactId?: string;
  @ApiPropertyOptional({ description: 'Defaults to now.' }) @IsISO8601() @IsOptional() occurredAt?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(300) @IsOptional() subject?: string;
  @ApiPropertyOptional({ description: 'Where a meeting took place.' })
  @IsString() @MaxLength(300) @IsOptional() location?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(20000) @IsOptional() bodyText?: string;
  @ApiPropertyOptional({ enum: ['INBOUND', 'OUTBOUND', 'INTERNAL'] })
  @IsIn(['INBOUND', 'OUTBOUND', 'INTERNAL']) @IsOptional() direction?: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  @ApiPropertyOptional({ description: 'Contacts who took part.' })
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @IsOptional() contactIds?: string[];
  @ApiPropertyOptional({ description: 'Team members who took part, besides the person logging it.' })
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @IsOptional() userIds?: string[];
}

export class ForwardInteractionDto {
  @ApiPropertyOptional({ description: 'Team members to email and notify.' })
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @IsOptional() userIds?: string[];
  @ApiPropertyOptional({ description: 'Organization people to email.' })
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @IsOptional() contactIds?: string[];
}

export class CreateContactDto {
  @ApiProperty() @IsString() @MaxLength(100) firstName!: string;
  @ApiPropertyOptional() @IsString() @MaxLength(100) @IsOptional() lastName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() title?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() linkedInUrl?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() personalUrl?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsEmail() @IsOptional() email?: string;
  @ApiPropertyOptional({ description: 'Link to this client on creation.' }) @IsString() @IsOptional() clientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() role?: string;
  @ApiPropertyOptional({ type: [String], description: 'CRM tags such as Partner, Referral source' })
  @IsArray() @IsString({ each: true }) @IsOptional() tags?: string[];
}

export class UpdateContactDto {
  @ApiPropertyOptional() @IsString() @MaxLength(100) @IsOptional() firstName?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(100) @IsOptional() lastName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() title?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() linkedInUrl?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() personalUrl?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() avatarUrl?: string | null;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
  @ApiPropertyOptional({ description: 'Set false once an auto-created contact has been reviewed.' })
  @IsBoolean() @IsOptional() autoCreated?: boolean;
  @ApiPropertyOptional({ type: [String], description: 'Replaces the contact\'s CRM tags.' })
  @IsArray() @IsString({ each: true }) @IsOptional() tags?: string[];
}

export class AddContactEmailDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isPrimary?: boolean;
}

export class LinkContactAccountDto {
  @ApiProperty() @IsString() clientId!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() role?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isPrimary?: boolean;
}


export class SetInternalDomainsDto {
  @ApiProperty({ description: 'Domains that count as your own team, e.g. ["thepurplenest.org"].' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  domains!: string[];
}

export class SetCaptureAliasDto {
  @ApiProperty({ description: 'New capture address local part, e.g. "tpn". Older aliases keep working.' })
  @IsString()
  @MaxLength(64)
  alias!: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgCategory } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateNetworkContactDto } from './create-network-contact.dto';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class CreateNetworkCompanyDto {
  @ApiProperty() @IsString() name!: string;

  @ApiPropertyOptional() @Transform(emptyToUndefined) @IsString() @IsOptional() website?: string;
  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  @IsOptional()
  email?: string;
  @ApiPropertyOptional() @Transform(emptyToUndefined) @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @IsOptional() services?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsArray() @IsString({ each: true }) @IsOptional() products?: string[];
  @ApiPropertyOptional({ enum: OrgCategory, isArray: true })
  @IsArray()
  @IsEnum(OrgCategory, { each: true })
  @IsOptional()
  focusCategories?: OrgCategory[];
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isReferralReady?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isPublicFeatured?: boolean;
  @ApiPropertyOptional() @IsInt() @IsOptional() publicSortOrder?: number;
  @ApiPropertyOptional() @IsDateString() @IsOptional() lastContactDate?: string;

  @ApiPropertyOptional({ type: CreateNetworkContactDto })
  @ValidateNested()
  @Type(() => CreateNetworkContactDto)
  @IsOptional()
  primaryContact?: CreateNetworkContactDto;
}

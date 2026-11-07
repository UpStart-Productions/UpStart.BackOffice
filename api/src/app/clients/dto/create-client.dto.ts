import { IsString, IsEmail, IsOptional, IsBoolean, IsArray, IsIn, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ORG_FOCUS_CATEGORIES } from '@upstart/back-office/shared';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const ACCOUNT_JOURNEYS = ['PROSPECT', 'CLIENT', 'NONE'] as const;
export type AccountJourneyValue = (typeof ACCOUNT_JOURNEYS)[number];

export class CreateClientDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ description: 'Short code prepended to invoice numbers, e.g. UPSP. Required once billing starts.' })
  @Transform(emptyToUndefined)
  @IsString() @Length(1, 8) @IsOptional() code?: string;

  @ApiPropertyOptional({ enum: ACCOUNT_JOURNEYS, description: 'Where the account is: prospect, client or other' })
  @IsIn(ACCOUNT_JOURNEYS) @IsOptional() journey?: AccountJourneyValue;

  @ApiPropertyOptional({ type: [String], description: 'CRM tags such as Partner, Referral source, Vendor' })
  @IsArray() @IsString({ each: true }) @IsOptional() tags?: string[];

  @ApiPropertyOptional({ description: 'For a new Prospect: also put a card in the first lane of the pipeline (default true).' })
  @IsBoolean() @IsOptional() addToPipeline?: boolean;

  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsEmail()
  @IsOptional()
  email?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() phone?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() address?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() city?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() state?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() zip?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() website?: string;
  @ApiPropertyOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @IsOptional()
  linkedInUrl?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional({ type: [String], description: 'Services this organization offers or is known for.' })
  @IsArray() @IsString({ each: true }) @IsOptional() services?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Products this organization offers or is known for.' })
  @IsArray() @IsString({ each: true }) @IsOptional() products?: string[];
  @ApiPropertyOptional({ enum: ORG_FOCUS_CATEGORIES, isArray: true, description: 'Focus areas (nonprofit sectors).' })
  @IsArray() @IsIn(ORG_FOCUS_CATEGORIES, { each: true }) @IsOptional() focusCategories?: (typeof ORG_FOCUS_CATEGORIES)[number][];
  @ApiPropertyOptional({ description: 'Include on a public partner or network listing when that site reads this flag.' })
  @IsBoolean() @IsOptional() isPublicFeatured?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

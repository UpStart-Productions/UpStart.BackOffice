import { IsString, IsEmail, IsOptional, IsBoolean, IsArray, IsIn, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const ACCOUNT_JOURNEYS = ['PROSPECT', 'CLIENT', 'PAST_CLIENT', 'NONE'] as const;
export type AccountJourneyValue = (typeof ACCOUNT_JOURNEYS)[number];

export class CreateClientDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ description: 'Short code prepended to invoice numbers, e.g. UPSP. Required once billing starts.' })
  @Transform(emptyToUndefined)
  @IsString() @Length(1, 8) @IsOptional() code?: string;

  @ApiPropertyOptional({ enum: ACCOUNT_JOURNEYS, description: 'Where the account is: prospect, client or past client' })
  @IsIn(ACCOUNT_JOURNEYS) @IsOptional() journey?: AccountJourneyValue;

  @ApiPropertyOptional({ type: [String], description: 'Role tags such as Partner, Referral source, Vendor' })
  @IsArray() @IsString({ each: true }) @IsOptional() roles?: string[];

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
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

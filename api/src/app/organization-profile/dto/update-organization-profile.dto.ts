import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TIME_ZONE_OPTIONS } from '@upstart/back-office/shared';
import { Type } from 'class-transformer';

export class UpdateOrganizationProfileDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(120)
  companyName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(2)
  state?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(20)
  zip?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(40)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  billingEmail?: string;

  /** Reimbursement per mile for Mileage expenses (e.g. 0.70). Null clears it. */
  @ApiPropertyOptional({ nullable: true })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  mileageRate?: number | null;

  /** The business's time zone (IANA name). */
  @ApiPropertyOptional({ example: 'America/Los_Angeles' })
  @IsOptional()
  @IsIn(TIME_ZONE_OPTIONS.map((o) => o.value))
  timeZone?: string;
}

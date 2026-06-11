import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBookingDto {
  @ApiProperty({ description: 'ISO 8601 UTC start time of the selected slot' })
  @IsISO8601()
  startAt!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  guestName!: string;

  @ApiProperty()
  @IsEmail()
  guestEmail!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(200)
  guestOrg?: string;

  @ApiPropertyOptional({ example: 'https://yourorg.org' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  guestWebsite?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  guestMessage?: string;

  @ApiPropertyOptional({ example: 'America/Los_Angeles' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  guestTimezone?: string;
}

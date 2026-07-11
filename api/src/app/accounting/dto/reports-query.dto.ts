import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ReportRangeQueryDto {
  @ApiPropertyOptional() @IsDateString() @IsOptional() from?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() to?: string;
}

export class AsOfQueryDto {
  @ApiPropertyOptional() @IsDateString() @IsOptional() asOf?: string;
}

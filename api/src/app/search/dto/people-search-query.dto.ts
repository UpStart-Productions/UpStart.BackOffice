import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class PeopleSearchQueryDto {
  @ApiPropertyOptional({
    example: 'jane',
    description: 'Optional filter. Omit to list known people (sorted by last name).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Omit contacts already on this project when suggesting duplicates.' })
  @IsOptional()
  @IsString()
  excludeProjectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(400)
  limit?: number;

  @ApiPropertyOptional({ description: 'When true, only CRM People records (for project client contacts).' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  crmOnly?: boolean;
}

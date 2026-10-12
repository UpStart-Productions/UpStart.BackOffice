import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class AvailabilityRuleDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiPropertyOptional({ description: 'Minutes from midnight in host timezone' })
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  startMinute!: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  endMinute!: number;
}

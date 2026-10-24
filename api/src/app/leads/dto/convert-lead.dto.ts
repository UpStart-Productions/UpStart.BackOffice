import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class ConvertLeadDto {
  @ApiPropertyOptional({ description: 'Short code prepended to invoice numbers, e.g. LOVN. Needed once you invoice.' })
  @IsString()
  @Length(1, 8)
  @IsOptional()
  code?: string;
}

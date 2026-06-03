import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ConvertLeadDto {
  @ApiProperty({ description: 'Short code prepended to invoice numbers, e.g. LOVN' })
  @IsString()
  @Length(1, 8)
  code!: string;
}

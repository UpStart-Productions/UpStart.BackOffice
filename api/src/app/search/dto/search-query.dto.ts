import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ example: 'western' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CopyLeadDto {
  @ApiProperty({ description: 'Destination pipeline' })
  @IsString()
  pipelineId!: string;

  @ApiProperty({ description: 'Destination lane' })
  @IsString()
  stageId!: string;
}

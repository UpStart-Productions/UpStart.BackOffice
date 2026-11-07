import { IsString } from 'class-validator';

export class AddPipelineCardDto {
  @IsString()
  pipelineId!: string;
}

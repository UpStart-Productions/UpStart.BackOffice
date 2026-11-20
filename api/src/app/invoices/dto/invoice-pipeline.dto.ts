import { IsOptional, IsString } from 'class-validator';

export class AddInvoicePipelineDto {
  @IsString()
  pipelineId!: string;

  /** Lane on that pipeline. Default: its first lane. */
  @IsOptional()
  @IsString()
  stageId?: string;
}

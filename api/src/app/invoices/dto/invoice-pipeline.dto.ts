import { IsString } from 'class-validator';

export class AddInvoicePipelineDto {
  @IsString()
  pipelineId!: string;
}

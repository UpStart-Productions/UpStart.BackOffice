import { Module } from '@nestjs/common';
import { PipelineStagesController, PipelinesController } from './pipelines.controller';
import { PipelinesService } from './pipelines.service';

@Module({
  controllers: [PipelinesController, PipelineStagesController],
  providers: [PipelinesService],
})
export class PipelinesModule {}

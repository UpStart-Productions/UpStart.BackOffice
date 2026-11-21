import { Module } from '@nestjs/common';
import { CapturePointsController } from './capture-points.controller';
import { CapturePublicController } from './capture-public.controller';
import { CapturePointsService } from './capture-points.service';

@Module({
  controllers: [CapturePointsController, CapturePublicController],
  providers: [CapturePointsService],
  exports: [CapturePointsService],
})
export class CapturePointsModule {}

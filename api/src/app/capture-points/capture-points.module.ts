import { Module } from '@nestjs/common';
import { CapturePointsController } from './capture-points.controller';
import { CapturePointsService } from './capture-points.service';

@Module({
  controllers: [CapturePointsController],
  providers: [CapturePointsService],
  exports: [CapturePointsService],
})
export class CapturePointsModule {}

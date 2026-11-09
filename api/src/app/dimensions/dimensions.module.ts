import { Module } from '@nestjs/common';
import { DimensionsController } from './dimensions.controller';
import { DimensionsService } from './dimensions.service';

@Module({
  controllers: [DimensionsController],
  providers: [DimensionsService],
  exports: [DimensionsService],
})
export class DimensionsModule {}

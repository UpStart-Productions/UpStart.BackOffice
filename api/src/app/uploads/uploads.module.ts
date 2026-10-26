import { Module } from '@nestjs/common';
import { ContentUploadsController } from './content-uploads.controller';
import { UploadsController } from './uploads.controller';

@Module({
  controllers: [UploadsController, ContentUploadsController],
})
export class UploadsModule {}

import { Global, Module } from '@nestjs/common';
import { STORAGE_SERVICE, StorageService } from './storage.interface';
import { ImageResizeService } from './image-resize.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';

const storageClass =
  process.env.STORAGE_PROVIDER === 's3' ? S3StorageService : LocalStorageService;

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: storageClass,
    },
    ImageResizeService,
  ],
  exports: [STORAGE_SERVICE, ImageResizeService],
})
export class StorageModule {}

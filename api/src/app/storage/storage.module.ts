import { Global, Module } from '@nestjs/common';
import { STORAGE_SERVICE, StorageService } from './storage.interface';
import { ImageResizeService } from './image-resize.service';
import { LocalStorageService } from './local-storage.service';
import { StorageFoldersService } from './storage-folders.service';
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
    {
      provide: StorageFoldersService,
      useFactory: (storage: StorageService) => new StorageFoldersService(storage),
      inject: [STORAGE_SERVICE],
    },
  ],
  exports: [STORAGE_SERVICE, ImageResizeService, StorageFoldersService],
})
export class StorageModule {}

import { Module } from '@nestjs/common';
import { ServiceKeyService } from './service-key.service';
import { ServiceKeysController } from './service-keys.controller';

@Module({
  providers:   [ServiceKeyService],
  controllers: [ServiceKeysController],
  exports:     [ServiceKeyService],
})
export class ServiceKeysModule {}

import { Module } from '@nestjs/common';
import { AsanaController } from './asana.controller';
import { AsanaService } from './asana.service';
import { AsanaSyncService } from './asana-sync.service';

@Module({
  controllers: [AsanaController],
  providers: [AsanaService, AsanaSyncService],
  exports: [AsanaService, AsanaSyncService],
})
export class AsanaModule {}

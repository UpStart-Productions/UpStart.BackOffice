import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientPipelineService } from './client-pipeline.service';
import { ClientsController } from './clients.controller';
import { ClientsImportService } from './clients-import.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ClientsController],
  providers: [ClientPipelineService, ClientsImportService],
})
export class ClientsModule {}

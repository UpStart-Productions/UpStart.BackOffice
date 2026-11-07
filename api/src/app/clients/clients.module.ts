import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClientPipelineService } from './client-pipeline.service';
import { ClientsController } from './clients.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [ClientsController],
  providers: [ClientPipelineService],
})
export class ClientsModule {}
